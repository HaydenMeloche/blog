---
title: "How EFT payment files work in Canada"
date: 2025-07-02
summary: "Billions of dollars still move through fixed-width text files. Here is what they look like."
---

Welcome to my first blog post! Today, I will be covering a topic I work with every day. Electronic Fund Transfers (EFTs), or more specifically, how systems move money through Canada's most common money-movement rail.

Though this isn't a technical guide, I thought it would be fun to share how this systems work at a high level. (Since for most devs working with static files instead of APIs is not common)

## Files instead of APIs

An example would be if you're running payroll. Hundreds of employees, every two weeks, money needs to leave your account and land in theirs. You *could* log into your bank and click through each one, but that's a lot of work and can be error-prone.

Instead, you generate a text file, drop it on an SFTP server, and let the bank handle it overnight. That format is called **CPA005**. It's part of the AFT (Automated Funds Transfer) system that Payments Canada runs. 


## The shape of the CPA005

Every line in a CPA005 file is exactly 1,464 characters, space padded with `\r\n` line endings. Here's a debit file with the whitespace collapsed so you can actually read it:

```
A 000000001 1234567890 0001 024015 00610 CDN
D 000000002 1234567890 0001
    450 0000007500 024015 0006 12345 987654321098 ...
    450 0000002500 024015 0006 12345 876543210987 ...
Z 000000003 1234567890 0001  total_debits=10000  count=2
```

There are three record types. **A** is the header (who's sending, file creation number, date, currency). **D** or **C** lines are the actual payments, debit or credit. **Z** is the trailer with control totals that have to add up perfectly or the whole file gets rejected.

Each D line can pack up to six payments into one 1,464-character row. If your last line only has two transactions, you pad the rest with spaces.

The header has an issuer number your bank assigns you, a file creation number that increments with every upload, and a creation date in Julian format. `0YYDDD` means day-of-year, so day 15 of 2024 is `024015`. Every institution also has its own recipient data centre code for routing.

A single payment looks like this:

```
450 0000007500 024015 0006 12345 987654321098  ...  EMP-0000000042
│   │          │      │    │     │                  └─ Reference number (19 chars)
│   │          │      │    │     └─ Account (12 chars, space-padded)
│   │          │      │    └─ Transit / branch (5 chars)
│   │          │      └─ Institution number (4 chars, leading zero)
│   │          └─ Transaction date, Julian format (0YYDDD)
│   └─ Amount in cents (10 digits)
└─ Operation code (3 digits)
```

Amounts are in cents. `0000007500` is $75. The three-digit code at the start is the operation type. Payroll, pension, and miscellaneous payments each have their own code; `450` here is misc payments. That's what shows up on the other person's bank statement.

The 19-character reference at the end is for you. You can put pretty much anything there, and it's useful later to track payment status.

## What comes back

With a normal API you send a request and get a response. Here, you upload a file to a folder and wait. The bank sends you other files back on its own schedule, and you have to piece together what happened.

For example this is how RBC works: 

```
CPA005 upload (SFTP)
        │
        ▼
RPT0101P ── file accepted? blocked? held?
        │
        ▼
   clearing (business days only)
        │
        ├──────────────────┐
        ▼                  ▼
      BAI2            RPT0900P
  transactions log    NSF, closed acct, etc.
```

You upload the CPA005. You get an **RPT0101P** back, the input verification report. This is before any money moves. This file is dropped on the SFTP as `RPT0101P.001`, `RPT0101P.002`, etc. It references your upload by file creation number and date, same values from your A record header.

Below is what the file could look like when everything is working:

```
ROYAL BANK                          INPUT VERIFICATION AND EDIT REPORT

HAYDEN LENDING CO          636742-0000   PAP CAD   FILE CREATION NUMBER: 0027

TRANSACTIONS RECEIVED                  2             664.08
TRANSACTIONS TO BE DISTRIBUTED         2             664.08
TRANSACTIONS BLOCKED                   0               0.00
```

`TO BE DISTRIBUTED` is the number of payments that we're accepted and will be credited/debited.

This file isn't exactly computer readable, you can parse it, but it's designed to be "human readable".

A header will be added if something is wrong, for example **T**, if one payment didn't happen because the account number is invalid.
```
536   00   Jane Borrower    1,618.33   0287 45192   8305174   371   2026 JUN 11
T-ACCT NUM FAILED MODULUS CHECK - INVALID ACCOUNT. ENTER VALID ACCT NUM.

TRANSACTIONS TO BE DISTRIBUTED        41          52,796.43
```

In the above example, 41 payments go out and one payment with a bad account number gets left behind. In this case we would need to create a 2nd payment file to fix that one payment.

## Reconciliation

Input verification tells you the bank accepted your file. Next, we want to know when/if the money clears.

At RBC first you get a **BAI2**, your daily bank statement via CSV. RBC drops one every day and this is usually the first sign that money actually moved. Debits show up as credits to your settlement account. Your balance goes up.

A real BAI2 is long. Most of it is balance summaries and wire transfers that are irrelevant. The section you need is buried in `16` transaction records with `88` continuation lines:

```
01,000300032,Grp1,251117,0638,1,80,1,2/       ← file header (bank, date, time)
02,Grp1,000300032,1,251117,0638,,2/           ← group header
03,000021000967,CAD,010,+54699921,,/          ← your settlement account
88,100,+114708456,,,102,,2,/                   ← balances (ledger, available, etc.)

16,466,87707007,V,251117,0638,0000000000000/  ← PAD debit that settled
88,Direct Payment (PAD's) service total    /
88,GRADS3392120000,PAY-0000000042,,,HAYDEN LENDING,,,,,DANIEL BORROWER,,,,,,,,161254/

16,466,161254,V,251117,0638,0000000000000/  ← individual debit that settled
88,GRADS3392120000,PAY-0000000042,,,HAYDEN LENDING,,,,,DANIEL BORROWER,,,,,,,,161254/

49,+227326320,44/                              ← account trailer
98,+227326320,1,46/                            ← group trailer
99,+227326320,1,47/                            ← file trailer
```

The `16` line is the transaction: type code, amount in cents, date. The `88` lines after it carry the description and your payment reference (`PAY-0000000042`). Type `466` is an individual PAD debit; type `166` is the corresponding PAD credit. Daily batch/summary totals aren't in the `16` lines at all, they live in the `88` summary records near the top of the file.

This file tells you what has actually happened, has the money you wanted to move actually moved? Using this file you can match your payment ID from previous dayss CPA005 and mark the payment as succeeded in your ledger.

Then, days later, **RPT0900P** shows up. The returned items report. If your debit/credit gets returned it will appear here. 

Unlike the BAI2, this one is fixed-width. Each line is exactly 190 characters. A real file with one NSF'd debit looks something like this:

```
00008226420000000125338  12042025822642000001
10008226420000000100101  D0           PAY-0000000042           Daniel Borrower               120320250000     0003000021243005           CADCAN0000000020006500000000RBC Billing   U901
30008226420000000125338  000000000            0000000000000000000000000000000   000000000000000000000000000000000000000000000000000000000001000000000000200065  0003000021242973
40008226420000000125338  000000010000000000002000650000000000000000000000000000000000000000000000000000000000010000000000002000650000000000000000000000000000000000000000000000000000
```

Line `0` is the header. Line `1` is the returned payment: `D` for debit, `PAY-0000000042` is your cross-reference from the CPA005 file, `000000002000650` is $2,000.65 in cents, and `U` + `901` at the end is NSF. Lines `3` and `4` are account and file trailers with the totals.

In this example payment `PAY-0000000042` you matched in the BAI2 a few days earlier, has now returned back and you will see on your BAI2 tomorow it has reversed.

## Learnings from the field

This entire process is not very well documented. With no test environment, we had to do a lot of testing in production. Here are some fun quirks we experienced along the way:
- Some types of CPA005 errors cause the entire file to not be processed, others cause just one payment to fail
- Insitution codes and transit numbers are available [directly](https://www.payments.ca/sites/default/files/2026-07-03-Banks_Numeric_List.pdf) from payments canada but you will never know if an account number exists before attempting a transaction
- When someone NSF's the money lands in your account first (and appears to have cleared) then the following day gets "returned" 
- An EFT can be reversed up to 90 days after it happened
- Payment files don't run on weekends, though you can upload them and date them for the weekend. When they clear days later it will show as if it did happen on the weekend
- Responses from the bank are not always consistent so we've had to build a lot of guards around rechecking for files past their suppose SLA time.

## Summary

That's it. Systems such as payroll and mortgage lending work by creating and reading these static text files to instruct and understand the status of transactions.

Although CPA005 is universal, the other supplementary files vary from bank to bank. Today I walked through process RBC uses. National bank's guide is available online, shows their process, and the types of files they return back. You can check that out here: https://www.nbc.ca/content/dam/bnc/outils-apps/entreprises/guides/preauthorized-debits-user-guide.pdf

There are other ways to send/recieve money. Wire transfers have greater visibility but can cost $20+ per transaction vs EFTs sub 10c per transaction. Other types such as e-transfer have less support and caps on transfer amounts.

## Eventually, real time

Canada's "Real-Time Rail" is supposed to go live Q4 2026 which promises instant payments, 24/7/365, built on **ISO 20022**.

If you're designing something new, [RTR's ISO 20022 specs](https://www.payments.ca/systems-services/payment-systems/real-time-rail-payment-system) are probably worth a look,
though I believe this system we have today will be running for a very long time. 

