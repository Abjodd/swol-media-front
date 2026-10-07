import { Route, Routes } from 'react-router-dom';
import CampaignList from './campaigns/CampaignList.jsx';
import CampaignDetail from './campaigns/CampaignDetail.jsx';

// /dashboard/campaigns       → list + "New campaign"
// /dashboard/campaigns/:id   → one campaign: brief, documents, vendors & creator targets
export default function Campaigns() {
  return (
    <Routes>
      <Route index element={<CampaignList />} />
      <Route path=":id" element={<CampaignDetail />} />
    </Routes>
  );
}
