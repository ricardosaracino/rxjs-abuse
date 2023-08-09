  createEffect(() => this.actions$.pipe(
    ofType(fromActions.SAVE_MANUAL_JOURNAL_ENTRY_WITH_LINES),
    map((action: fromActions.SaveManualJournalEntryWithLines) => action.payload),
    switchMap((req) => (
      (req.group.id ? this.journalEntryGroupsService.update(req.group) : this.journalEntryGroupsService.create(req.group)).pipe(
        // race condition on adjusted
        switchMap(group => (req.origLines.length > 0 ?
          this.journalEntryLinesService.deleteAll(req.origLines.map(d => d.id)).pipe(map(() => group)) : of(group)),
        ))
    ).pipe(
      switchMap((group) => forkJoin(req.lines.map(row => this.journalEntryLinesService.create({
            glAccountId: row.glAccountId,
            allocationSchemeId: row.allocationSchemeId,
            amountNative: row.amountNative,
            manualJEGroupId: group.id,
            accountingDate: group.accountingDate,
            entryDate: group.entryDate,
            nativeCurrencyId: group.nativeCurrencyId,
            exchangeRate: group.exchangeRate,
            peDealUuid: group.peDealUuid,
            comment: group.comment,
          }).pipe(
            // TODO do we need sub lines if we dont have a partner?
            switchMap((line) => this.journalEntrySubLinesService.create({
                manualJELineId: line.id,
                amountNative: line.amountNative,
                comment: group.comment,
              }).pipe(
                switchMap((subLine) => !row.partnerId ? of(null) :
                  this.journalEntryPartnerLinesService.create({
                    manualJESubLineId: subLine.id,
                    partnerId: row.partnerId,
                    amountNative: subLine.amountNative,
                  }),
                )),
            )),
        )).pipe(
          switchMap(() => this.journalEntryGroupsService.commit(group).pipe(
            map((resp) => new fromActions.SaveManualJournalEntryWithLinesSuccess(resp)),
            catchError(error => of(new fromActions.SaveManualJournalEntryWithLinesFail(error))),
          )),
        ),
      ))),
  ));
