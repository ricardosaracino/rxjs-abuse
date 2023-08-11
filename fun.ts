export class ManualJournalEntryEffect {

  constructor(
    private actions$: Actions,
    private fundValuationService: FundValuationService,
    private journalEntryGroupsService: ManualJournalEntryGroupsService,
    private journalEntryLinesService: ManualJournalEntryLinesService,
    private journalEntrySubLinesService: ManualJournalEntrySubLinesService,
    private journalEntryPartnerLinesService: ManualJournalEntryPartnerLinesService,
  ) {
  }

  public searchManualJournalEntries$ = createEffect(() => this.actions$.pipe(
    ofType(fromActions.SEARCH_MANUAL_JOURNAL_ENTRIES),
    map((action: fromActions.SearchManualJournalEntries) => action.payload),
    switchMap((req) => this.journalEntryGroupsService.findAll(req).pipe(
      map((resp) => new fromActions.SearchManualJournalEntriesSuccess(resp)),
      catchError(error => of(new fromActions.SearchManualJournalEntriesFail(error))),
    )),
  ));

  public findManualJournalEntryWithLines$ = createEffect(() => this.actions$.pipe(
    ofType(fromActions.FIND_MANUAL_JOURNAL_ENTRY_WITH_LINES),
    map((action: fromActions.FindManualJournalEntryWithLines) => action.payload),
    switchMap((id) => forkJoin([
      this.journalEntryGroupsService.findOne(id).pipe(
        switchMap(group =>
          group.jeGroupId ? this.journalEntryGroupsService.canEdit(group.jeGroupId).pipe(map(canEdit => [group, canEdit])) :
            of([group, true]),
        ),
      ),
      this.journalEntryLinesService.findAll(id),
    ]).pipe(
      map(([[group, canEdit], lines]: any) => new fromActions.FindManualJournalEntryWithLinesSuccess({
        group,
        lines,
        canEdit,
      })),
      catchError(error => of(new fromActions.FindManualJournalEntryWithLinesFail(error))),
    )),
  ));

  public findManualJournalEntriesLines$ = createEffect(() => this.actions$.pipe(
    ofType(fromActions.FIND_MANUAL_JOURNAL_ENTRY_LINES),
    map((action: fromActions.FindManualJournalEntryLines) => action.payload),
    switchMap((req) => this.journalEntryLinesService.findAll(req).pipe(
      map((resp) => new fromActions.FindManualJournalEntryLinesSuccess(resp)),
      catchError(error => of(new fromActions.FindManualJournalEntryLinesFail(error))),
    )),
  ));

  public saveManualJournalEntryWithLines$ = createEffect(() => this.actions$.pipe(
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

  public copyManualJournalEntry$ = createEffect(() => this.actions$.pipe(
    ofType(fromActions.COPY_MANUAL_JOURNAL_ENTRY),
    map((action: fromActions.CopyManualJournalEntry) => action.payload),
    // Don't call copy it will create a new mje
    switchMap((id) => forkJoin([
      this.journalEntryGroupsService.findOne(id).pipe(
        switchMap(group => this.fundValuationService.findValuationStatusForFund(group.fundId).pipe(
          map(status => ({
            ...group,
            id: null,
            accountingDate: status.currentDealingDate,
            entryDate: status.currentDealingDate,
          })),
        )),
      ),
      this.journalEntryLinesService.findAll(id).pipe(
        map(lines => lines.map(line => ({ ...line, id: null }))),
      ),
    ]).pipe(
      map(([group, lines]) => new fromActions.CopyManualJournalEntrySuccess({ group, lines })),
      catchError(error => of(new fromActions.CopyManualJournalEntryFail(error))),
    )),
  ));

  public deleteManualJournalEntries$ = createEffect(() => this.actions$.pipe(
    ofType(fromActions.DELETE_MANUAL_JOURNAL_ENTRIES),
    map((action: fromActions.DeleteManualJournalEntries) => action.payload),
    switchMap((req) => this.journalEntryGroupsService.uncommitDeleteAll(req).pipe(
      map((resp) => new fromActions.DeleteManualJournalEntriesSuccess(resp)),
      catchError(error => of(new fromActions.DeleteManualJournalEntriesFail(error))),
    )),
  ));
}
