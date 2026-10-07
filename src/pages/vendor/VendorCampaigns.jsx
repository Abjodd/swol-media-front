import { Route, Routes } from 'react-router-dom';
import VendorCampaignList from './VendorCampaignList.jsx';
import VendorCampaignDetail from './VendorCampaignDetail.jsx';

// Vendor portal
// /dashboard/campaigns       → every campaign the vendor is assigned to, with what's needed
// /dashboard/campaigns/:id   → one campaign: what is required of them, and the creators they have added
export default function VendorCampaigns() {
  return (
    <Routes>
      <Route index element={<VendorCampaignList />} />
      <Route path=":id" element={<VendorCampaignDetail />} />
    </Routes>
  );
}
