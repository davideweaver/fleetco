# Fix pass: canonical rules for every V1 guide screen and narration

Apply these everywhere in the files you own. They come from a scope review against
`docs/V1 Alignment.md` and `docs/Meetings/Punchlist From Cam for v1/Key decisions.md`.
When a rule and existing text disagree, the rule wins.

1. **Stage names** (exactly, sentence case): Ready for production · In production · Production complete ·
   Ready for installation · Installation in progress · Completed. `lib/wire.js` already holds them in
   `T.stages`; replace any literal "Ready for install" / "Install in progress".
2. **Finished vs. closed.** When the technician finishes, the job stays in "Installation in progress" with a
   "Needs review" tag. It moves to "Completed" only when the owner closes it.
3. **Review step words.** Tag: "Needs review". Technician button: "Done · send for review". Owner action:
   "Review and close". Never "approve the finished job", "Waiting for owner", "send to owner to check".
4. **Clock in**, never "punch in". "Clock in" / "Clocked in 7:02 AM" / "Clock out".
5. **Business name** on anything the customer sees (estimate, invoice, PDF, payment page, email):
   "OTC Fleet Graphix". The owner's top bar shows "OTC Fleet Graphix" (shell() in wire.js does this), not
   "Division: Graphics".
6. **No built-in email.** The app never sends email. Estimates and invoices: "Download PDF" and
   "Mark as sent". The invoice PDF includes a pay-by-card link. The owner emails the PDF from their own
   email. A customer-side email wireframe is fine if it is clearly the owner's own email. Remove any
   in-app "Send" / "Email estimate" window. Toasts: "PDF downloaded", "Marked as sent".
7. **Deposits are recorded, not collected by link** (collecting by link is open question 4.3).
   "Record deposit" → "Deposit recorded · $1,009.50" (method e.g. "Check"). Never gate Create job on a
   paid deposit. Don't hard-code "50%"; say "Deposit". Only picture 1.4 may show a card deposit link, and
   it must carry a handwritten "? deposits by card link" note.
8. **Creating the job is a click.** The owner clicks "Create job" on the approved estimate. Never say
   approval creates the job automatically.
9. **Design files** are "Artwork v3.pdf". Never "Proof … (approved)" and never "approved design files".
10. **Role words.** The field role is "Technician" everywhere (no "Installer"). Asset word is "Vehicle"
    (no "Vehicle or sign"). Graphics asset types are Vehicle and Trailer; signs and walls are open
    question 4.6, so show "Sign / wall" only as a greyed row with "?" if at all.
11. **What technicians can't see** — say "costs, markup and profit" (the agreed wording). Screens can still
    keep estimates and invoices owner-only, but don't claim more in words. Any roles table is labeled
    "Proposed" with a handwritten "? confirm what a technician can see".
12. **View switcher** labels: "Board / List / Schedule".
13. **Estimate toggle**: "Your view" / "Customer view".
14. **Unit 17** is "2023 Ford Transit 350 HD" everywhere (Unit 14 stays "2024 Ford Transit 250").
    Unit 17's film is 74 ft, price $2,109.00. Unit 14 is $2,019.00.
15. **Invoice** section title "Other unpaid invoices", with a "Total of other unpaid invoices" line.
16. **Job costing**: actual materials are "as entered on the job", hours "from the job timers". No automatic
    material tracking.
17. **Wording**: "Export to spreadsheet" (not CSV). "Sent to QuickBooks" (not "synced"). "Export for payroll"
    (not "send to payroll"). "Pay period" (not "the week") for timesheet approval.
18. **Job checklist** (V1 item 6.3): technician job details show a "Checklist" box: "Before install:
    vehicle condition checked" and "Final quality check", with a handwritten "? which checklist items".
19. **Technician's jobs match the owner's board.** Technician 1 is assigned G-1052, G-1048, G-1046,
    G-1044, G-1043 (Millport School District, Shop wall mural, Installation in progress) and G-1041.
    The technician's board/phone list must show all their active ones.
20. Dates were already moved to the 2026 calendar. Don't change dates.

Do not run git. Do not record videos or overwrite files in `v1-index/media/`. You may run
`node shoot.mjs <page> <your scratch dir> <ids>` and Read the PNGs to check your edits render, using
`/tmp/claude-0/-home-user-fleetco/e9c13c34-5416-5555-9035-fe01c64743f5/scratchpad/fix-<yourname>/`.
Keep each scene's on-screen actions short enough to fit its narration.
