import { Route, Routes } from 'react-router-dom';
import ClientCampaignList from './ClientCampaignList.jsx';
import ClientCampaignDetail from './ClientCampaignDetail.jsx';

// Client (brand) portal
// /dashboard/campaigns       → their campaigns, with how many creators are waiting for a decision
// /dashboard/campaigns/:id   → one campaign: the basics, the shortlist to review, and the selected creators
export default function ClientPortal() {
  return (
    <Routes>
      <Route index element={<ClientCampaignList />} />
      <Route path=":id" element={<ClientCampaignDetail />} />
    </Routes>
  );
}
