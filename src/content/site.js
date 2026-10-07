// ─────────────────────────────────────────────────────────────────────────────
// All the words on the public homepage live here. Edit freely — no code changes needed.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE = {
  name: 'Swol Media',
  parent: 'Swol Media Entertainment',
  contactEmail: 'hello@swolmedia.com', // ← replace with your real inbox

  hero: {
    eyebrow: 'Swol Media Entertainment',
    titleLines: ['Creator campaigns', 'at mass scale.'],
    highlight: 'at mass scale.',
    subtitle:
      'Swol Media runs large creator campaigns from one platform. Our team sets up the campaign, vendor partners bring in the creators, and the brand approves every creator before they go live.',
    primaryCta: 'Run a campaign with us',
    secondaryCta: 'Partner sign in',
  },

  marquee: [
    'Mass creator campaigns',
    'Vendor network',
    'Creator sourcing',
    'Internal review',
    'Client approvals',
    'Campaign tracking',
  ],

  about: {
    eyebrow: 'About Swol Media',
    title: 'Built for campaigns that need creators in the hundreds.',
    body: [
      'Big campaigns need a lot of creators, fast. Swol Media connects a network of vendor partners who source creators, an internal team that picks the best fit, and the client who gives the final yes.',
      'Everyone works from the same platform, each with their own dashboard — so nobody chases spreadsheets, and every creator on a campaign has been reviewed and approved.',
    ],
    points: ['Creators at volume', 'Vendor-sourced talent', 'Curated by our team', 'Client-approved before launch'],
  },

  platform: {
    eyebrow: 'What the platform does',
    title: 'Every step of a mass campaign, in one place.',
    items: [
      { icon: '◎', title: 'Campaign setup', text: 'Our team creates each campaign with its brief, timeline and how many creators it needs.' },
      { icon: '▤', title: 'Vendor assignment', text: 'Vendors are assigned to a campaign, each with a clear number of creators to bring in.' },
      { icon: '⇪', title: 'Creator uploads', text: 'Vendors see exactly how many creators they owe and upload them straight into the campaign.' },
      { icon: '✦', title: 'Internal review', text: 'Our team reviews every submitted creator and shortlists the ones that fit the brief.' },
      { icon: '✓', title: 'Client approval', text: 'The client reviews the shortlist and approves creators — only approved creators join the campaign.' },
      { icon: '◧', title: 'Campaign tracking', text: 'Everyone sees where things stand: creators needed, submitted, shortlisted and approved.' },
    ],
  },

  portals: {
    eyebrow: 'Three dashboards, one login page',
    title: 'Each team sees only what they need to do.',
    lead: 'The internal team, vendors and clients all sign in from the same place — and each lands on a dashboard built around their part of the campaign.',
    items: [
      {
        key: 'internal',
        tag: 'Swol Media team',
        title: 'Internal team',
        text: 'Run the campaign from start to finish.',
        bullets: ['Create campaigns', 'Assign vendors & creator targets', 'Review & shortlist creators'],
        login: 'Team sign in',
      },
      {
        key: 'vendor',
        tag: 'Creator partners',
        title: 'Vendors',
        text: 'Know exactly what each campaign needs from you.',
        bullets: ['See assigned campaigns', 'Creators required vs. submitted', 'Upload creators & track status'],
        login: 'Vendor sign in',
      },
      {
        key: 'client',
        tag: 'Brands',
        title: 'Clients',
        text: 'Decide who represents your brand.',
        bullets: ['Review shortlisted creators', 'Approve or decline in one click', 'See approved creators per campaign'],
        login: 'Client sign in',
      },
    ],
  },

  steps: {
    eyebrow: 'How a campaign runs',
    title: 'From brief to approved creators in five steps.',
    items: [
      { who: 'Internal team', title: 'Create', text: 'The campaign is set up with its brief and the total number of creators needed.' },
      { who: 'Internal team', title: 'Assign', text: 'Vendors are assigned, each with their own creator target.' },
      { who: 'Vendors', title: 'Upload', text: 'Vendors upload the creators they’ve sourced for the campaign.' },
      { who: 'Internal team', title: 'Review', text: 'Our team reviews the submissions and shortlists the best creators.' },
      { who: 'Client', title: 'Approve', text: 'The client approves — and only then are creators locked into the campaign.' },
    ],
  },

  cta: {
    title: 'Planning a big creator campaign?',
    text: 'Tell us about the brand, the scale and the timeline — we’ll take it from there.',
  },
};
