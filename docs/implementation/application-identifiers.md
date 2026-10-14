# Application identifiers

An Application Reference is a project-generated identifier stored in
`RenewalApplication.referenceNumber`. Newly submitted applications use the
`MPWT-YYYYMMDD-XXXXXXXXXXXX` prefix and structure. This project-generated
reference is not claimed to be an official MPWT government numbering standard.

The Application Reference is distinct from the payment Transaction No., which
continues to use its existing `90L...` format, and from the inspection
Certificate No., which continues to use its existing digits-only format.

`Payment.invoiceNumber` is the legacy/internal column name for the shared
official-facing Transaction No.; citizen-facing API and UI use
`transactionNumber`. The same value is used by the invoice and inspection sheet.
