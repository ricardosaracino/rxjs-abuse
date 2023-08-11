createEffect(() => this.actions$.pipe(
    ofType(fromActions.SAVE_MANUAL_JOURNAL_ENTRY_WITH_LINES),
    map((action: fromActions.SaveManualJournalEntryWithLines) => action.payload),
    switchMap((req) => ( 
      (req.group.id ? this.journalEntryGroupsService.update(req.group) : this.journalEntryGroupsService.create(req.group)).pipe(
        // race condition on adjusted
        switchMap(group => (req.origLines.filter(d => d.id > 0).length === 0 ? of(group) :
          // copy has lines with no ids
          this.journalEntryLinesService.deleteAll(req.origLines.filter(d => d.id > 0).map(d => d.id)).pipe(map(() => group))),
        ))
    ).pipe(req.lines.filter(line => line.partnerId > 0).length === 0 ?
      // No partner lines then just batch create
      switchMap((group) => req.lines.length === 0 ? of(null) :
        this.journalEntryLinesService.createAll(req.lines.map(row => ({
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
          })),
        ).pipe(
          switchMap(() => this.journalEntryGroupsService.commit(group).pipe(
            map((resp) => new fromActions.SaveManualJournalEntryWithLinesSuccess(resp)),
            catchError(error => of(new fromActions.SaveManualJournalEntryWithLinesFail(error))),
          )),
        ),
      ) :
      // if we have partner lines we cannot batch update
      switchMap((group) =>
        forkJoin(req.lines.map(row => this.journalEntryLinesService.create({
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
            switchMap((line) => !row.partnerId ? of(null) : this.journalEntrySubLinesService.create({
                manualJELineId: line.id,
                amountNative: line.amountNative,
                comment: group.comment,
              }).pipe(
                switchMap((subLine) =>
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
      ),
    )),
  ));
