# Follow-up end-to-end audit

- PASS stats expose completions — {"active_chains":9,"completed_chains":2,"saved_messages":30,"total_participants":28,"updated_at":"2026-11-15T14:42:35.104Z"}
- PASS public chain aejNMmJVZL — {"status":"COMPLETED","current":12,"messages":12}
- PASS public chain 5qKar8ynUa — {"status":"COMPLETED","current":12,"messages":12}
- PASS ru gallery finds completed chain — RU code present
- PASS en gallery finds completed chain — EN code present
- PASS map reflects completed turns — {"period":"all","total_events":30,"countries":[{"country_code":"RU","count":13},{"country_code":"US","count":11},{"country_code":"UNKNOWN","count":6}],"updated_at":"2026-11-15T14:42:35.169Z"}
- PASS public chain 2 UI — result layout present
- PASS gallery UI shows RU and EN — both completed links present
- PASS map UI has aggregate rows — aggregate row visible
- PASS map all-time control — all-time active
- PASS English interface — brand localized
- PASS cancel turn screen — turn present
- PASS cancel returns to home — landing present
- PASS cancel survives reload — verified after 800 ms reload wait
- PASS invalid public chain error — error state rendered after 900 ms fetch wait

Console errors 2.
Screenshots saved in artifacts/e2e-audit.