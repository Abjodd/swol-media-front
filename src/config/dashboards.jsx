// ─────────────────────────────────────────────────────────────────────────────
// The single source of truth for every dashboard in Swol Media.
// Each role gets its own set of tabs. To ship a new phase, swap a tab's
// `element` from <WorkInProgress/> to the real page — nothing else changes.
// To add a brand-new dashboard type, add a role here and in server/src/models/User.js.
// Every dashboard also gets a Profile page automatically (see App.jsx).
// ─────────────────────────────────────────────────────────────────────────────
import { lazy } from 'react';
import WorkInProgress from '../components/WorkInProgress.jsx';
import WelcomeInProgress from '../pages/WelcomeInProgress.jsx';

// Each page is downloaded the first time it's opened, so signing in only loads what that person uses
// (a vendor never downloads the internal Overview, a client never downloads Settings…).
const Settings = lazy(() => import('../pages/internal/Settings.jsx'));
const Overview = lazy(() => import('../pages/internal/Overview.jsx'));
const Campaigns = lazy(() => import('../pages/internal/Campaigns.jsx'));
const Vendors = lazy(() => import('../pages/internal/Vendors.jsx'));
const Creators = lazy(() => import('../pages/internal/Creators.jsx'));
const Clients = lazy(() => import('../pages/internal/Clients.jsx'));
const VendorCampaigns = lazy(() => import('../pages/vendor/VendorCampaigns.jsx'));
const ClientPortal = lazy(() => import('../pages/client/ClientPortal.jsx'));
const ClientOverview = lazy(() => import('../pages/client/ClientOverview.jsx'));

export const DASHBOARDS = {
  internal: {
    label: 'Internal',
    workspace: 'Internal workspace',
    tabs: [
      {
        path: 'overview',
        label: 'Overview',
        icon: 'overview',
        subtitle: 'Everything happening across Swol Media',
        hero: true, // the page opens with its own greeting
        element: <Overview />,
      },
      {
        path: 'campaigns',
        label: 'Campaigns',
        icon: 'campaigns',
        subtitle: 'Create campaigns and track them end to end',
        element: <Campaigns />,
      },
      {
        path: 'clients',
        label: 'Clients',
        icon: 'building',
        subtitle: 'The brands you run campaigns for — their campaigns and logins',
        element: <Clients />,
      },
      {
        path: 'vendors',
        label: 'Vendors',
        icon: 'vendors',
        subtitle: 'Vendor partners — contact, tax and bank details',
        element: <Vendors />,
      },
      {
        path: 'creators',
        label: 'Creators',
        icon: 'creators',
        subtitle: 'Every creator profile added across campaigns',
        element: <Creators />,
      },
      {
        path: 'settings',
        label: 'Settings',
        icon: 'settings',
        subtitle: 'Accounts and access for vendors, clients and your team',
        element: <Settings />,
      },
    ],
  },
  vendor: {
    label: 'Vendor',
    workspace: 'Vendor portal',
    tabs: [
      {
        path: 'campaigns',
        label: 'My campaigns',
        icon: 'campaigns',
        subtitle: 'Campaigns you’re assigned to and how many creators each one needs from you',
        hero: true,
        element: <VendorCampaigns />,
      },
    ],
  },
  client: {
    label: 'Client',
    workspace: 'Client portal',
    tabs: [
      {
        path: 'overview',
        label: 'Overview',
        icon: 'overview',
        subtitle: 'How your campaigns are going',
        hero: true,
        element: <ClientOverview />,
      },
      {
        path: 'campaigns',
        label: 'Campaigns',
        icon: 'campaigns',
        subtitle: 'Your campaigns with Swol Media. Review shortlisted creators and see who’s on each campaign.',
        element: <ClientPortal />,
      },
    ],
  },
  creator: {
    label: 'Creator',
    workspace: 'Creator portal',
    tabs: [{ path: 'home', label: 'Home', icon: 'home', subtitle: 'Your campaigns', element: <WelcomeInProgress portal="creator" /> }],
  },
};

export const ROLE_OPTIONS = [
  { value: 'vendor', label: 'Vendor' },
  { value: 'client', label: 'Client' },
  { value: 'creator', label: 'Creator' },
  { value: 'internal', label: 'Internal team' },
];

export const roleLabel = (r) => ROLE_OPTIONS.find((o) => o.value === r)?.label || r;
