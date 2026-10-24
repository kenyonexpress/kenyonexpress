# Meta WhatsApp Business Verification

**BACKLOG Item 3:** Meta WhatsApp Business verification, after 10 sales

## Prerequisites

- ✅ 10 sales milestone achieved
- Business registration documents ready
- Phone number verified with WhatsApp Business
- Facebook Business Manager account created

## Verification Requirements

### Business Information
- Legal business name: [To be filled]
- Business registration number: [From Israeli Ministry]
- Business category: E-commerce / Retail
- Business website: https://kenyonexpress.co.il
- Business email: kenyonexpress@gmail.com
- Business phone: +972-52-463-5550

### Required Documents
1. Business registration certificate (ח.פ. / ע.מ.)
2. Proof of business address
3. Government-issued ID of business owner
4. Tax registration documents

### WhatsApp Business Profile
- Display name: קניון אקספרס / Kenyon Express
- Business description: הדילים הכי זולים בישראל
- Category: Shopping & Retail
- Business hours: [Configure based on support availability]
- WhatsApp Business API account (required for verification)

## Implementation Checklist

### Phase 1: Preparation (Before 10 sales)
- [ ] Create Facebook Business Manager account
- [ ] Set up WhatsApp Business account
- [ ] Collect all required documents
- [ ] Verify business phone number
- [ ] Configure WhatsApp Business profile

### Phase 2: Application (After 10 sales milestone)
- [ ] Navigate to Meta Business verification
- [ ] Upload business documents
- [ ] Complete verification form
- [ ] Submit application
- [ ] Await Meta review (typically 1-3 business days)

### Phase 3: Post-Verification
- [ ] Configure WhatsApp Business API
- [ ] Set up automated messages (order confirmations, shipping updates)
- [ ] Integrate with customer support workflow
- [ ] Update privacy policy with WhatsApp data usage
- [ ] Enable WhatsApp Business badge on website

## Sales Milestone Tracker

Created helper to check when milestone is reached:
- Location: `src/lib/milestones/sales-tracker.ts`
- Checks: Total paid orders count >= 10
- Trigger: Notifies when milestone achieved

## Resources

- Meta Business Verification: https://business.facebook.com/business/help/2058515294227817
- WhatsApp Business API: https://developers.facebook.com/docs/whatsapp
- Israeli Business Registration: https://www.gov.il/

## Next Steps

Once 10 sales milestone is achieved:
1. Run sales tracker to confirm count
2. Begin Phase 2 verification application
3. Monitor application status
4. Complete Phase 3 integration

**Status:** Prepared for execution after milestone
