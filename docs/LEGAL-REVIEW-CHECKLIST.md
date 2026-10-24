# Legal Review Checklist

**BACKLOG Item 4:** Israeli lawyer review of ToS and Privacy, after 10 sales

## Prerequisites

- ✅ 10 sales milestone achieved
- ✅ Terms of Service published at /terms
- ✅ Privacy Policy published at /privacy
- ✅ Returns Policy published at /returns
- Lawyer retained for review

## Documents for Review

### 1. Terms of Service (`src/app/(legal)/terms/page.tsx`)
**Current status:** Published and active  
**Location:** https://kenyonexpress.co.il/terms

**Review focus areas:**
- [ ] Purchase agreement terms
- [ ] Delivery obligations and timeframes
- [ ] Cancellation and refund policy (14-day Israeli law)
- [ ] Limitation of liability
- [ ] Dispute resolution mechanism
- [ ] Compliance with Israeli Consumer Protection Law
- [ ] Digital goods vs physical goods distinction
- [ ] Voucher terms and expiration

### 2. Privacy Policy (`src/app/(legal)/privacy/page.tsx`)
**Current status:** Published and active  
**Location:** https://kenyonexpress.co.il/privacy

**Review focus areas:**
- [ ] Data collection disclosure
- [ ] GDPR compliance (Israeli Privacy Protection Law alignment)
- [ ] Cookie policy
- [ ] Third-party service disclosures (Supabase, Vercel, Analytics)
- [ ] User rights (access, deletion, correction)
- [ ] Data retention periods
- [ ] International data transfers
- [ ] Children's privacy

### 3. Returns Policy (`src/app/(legal)/returns/page.tsx`)
**Current status:** Published and active  
**Location:** https://kenyonexpress.co.il/returns

**Review focus areas:**
- [ ] 14-day cooling-off period (Israeli law requirement)
- [ ] Return process and conditions
- [ ] Refund timelines
- [ ] Restocking fees (if any)
- [ ] Digital goods exemptions
- [ ] Damaged goods policy

## Israeli Law Compliance Checklist

### Consumer Protection Law Requirements
- [ ] Clear pricing in NIS (₪)
- [ ] Total price including VAT displayed
- [ ] Shipping costs disclosed before purchase
- [ ] 14-day return right for distance sales
- [ ] Business details (name, address, registration)
- [ ] Contact information clearly displayed

### E-Commerce Specific
- [ ] Electronic signature validity
- [ ] Order confirmation emails
- [ ] Transaction security disclosures
- [ ] Payment provider information

### Data Protection (Privacy Protection Law)
- [ ] Consent mechanism for data collection
- [ ] Right to access personal data
- [ ] Right to deletion
- [ ] Data breach notification procedures
- [ ] Data security measures disclosed

## Lawyer Engagement Process

### Finding a Lawyer
**Recommended specialties:**
- E-commerce law
- Consumer protection
- Data privacy / technology law
- Israeli regulatory compliance

**Questions to ask:**
1. Experience with e-commerce businesses?
2. Familiarity with Israeli Consumer Protection Law?
3. Fixed fee for ToS/Privacy review?
4. Turnaround time?
5. Ongoing retainer availability?

### Review Process
1. **Preparation (before lawyer engagement)**
   - Export current ToS, Privacy, Returns as PDFs
   - List all third-party services and data processors
   - Document payment flows and refund processes
   - List all cookies and tracking technologies

2. **Lawyer review**
   - Provide all documents
   - Schedule review call
   - Discuss any regulatory concerns
   - Receive markup/comments

3. **Implementation**
   - Update legal documents based on feedback
   - Implement recommended policy changes
   - Update cookie consent if needed
   - Version control legal document changes

4. **Ongoing**
   - Establish review schedule (annual or when major changes)
   - Retainer for quick legal questions

## Cost Estimate

**One-time review:** ₪3,000 - ₪8,000  
**Ongoing retainer:** ₪1,500 - ₪3,000 / month  

## Sales Milestone Tracker

The milestone tracker at `src/lib/milestones/sales-tracker.ts` automatically checks when 10 sales is reached to trigger this review process.

## Next Steps

1. **At 8 sales:** Begin researching Israeli e-commerce lawyers
2. **At 10 sales:** 
   - Confirm milestone with sales tracker
   - Contact 2-3 lawyers for quotes
   - Prepare document export
3. **After lawyer selection:**
   - Schedule review
   - Provide documents
   - Implement feedback

**Status:** Ready for execution after 10 sales milestone
