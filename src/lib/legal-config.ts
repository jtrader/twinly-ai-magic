// Resolved bracketed values from the "Twinly Website Legal Policy Suite v2"
// document. Update here to re-flow every legal page.
export const LEGAL = {
  effectiveDate: "13 July 2026",
  company: {
    legalName: "Twinly.life T/A Streamline Direct",
    jurisdiction: "Australia",
    identifierLabel: "ABN",
    identifier: "85 355 423 363",
    registeredOffice: "Australia — full registered office address to be inserted before publication.",
  },
  contact: {
    support: "support@lovekey.com.au",
    privacy: "support@lovekey.com.au",
    creatorSupport: "support@lovekey.com.au",
    copyright: "support@lovekey.com.au",
    takedown: "support@lovekey.com.au",
    deepfake: "support@lovekey.com.au",
    safety: "support@lovekey.com.au",
    appeals: "support@lovekey.com.au",
    counterNotice: "support@lovekey.com.au",
  },
  governingLaw: "the laws of New South Wales, Australia",
  forum: "the courts of New South Wales, Australia",
  payment: {
    primary: "Stripe (payments and Stripe Identity for age/identity verification)",
  },
  aiProviders: [
    "Venice AI — uncensored chat completions, image generation, and video generation (used for explicit-tier chat and Twinly Create image/video jobs)",
    "Lovable AI Gateway (Google Gemini) — default safe-for-work chat model for personas not routed to Venice",
    "ElevenLabs — voice cloning and text-to-speech for personas with a cloned voice enabled",
    "HeyGen — talking-head video generation",
  ],
  hostingProviders: ["Lovable Cloud (Supabase-backed managed infrastructure) — storage, database, edge compute, logging, and delivery"],
  verificationProviders: ["Stripe Identity — document + selfie verification for identity and age assurance"],
  reviewSla: "an initial review within 72 hours",
  creator: {
    revenueShare: "75% to the creator, 25% to the platform, calculated on net receipts after payment-processor and refund/chargeback deductions",
    payoutSchedule: "on request through the payouts dashboard once the balance clears the minimum threshold",
    minimumThreshold: "USD $75 (or local-currency equivalent)",
  },
  liability: {
    cap: "AUD $100",
    period: "12 months",
  },
};
