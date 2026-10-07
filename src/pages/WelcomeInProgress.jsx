import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roleLabel } from '../config/dashboards.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

// What each portal will be able to do once its phase ships (from the product plan).
const COMING = {
  vendor: [
    { icon: 'campaigns', title: 'Your campaigns', text: 'See every campaign you’ve been assigned to, with briefs and deadlines.' },
    { icon: 'creators', title: 'Creator targets', text: 'Know exactly how many creators each campaign needs from you — and how many you’ve sent.' },
    { icon: 'upload', title: 'Upload creators', text: 'Add creators one by one or in bulk, then track whether they’re shortlisted and approved.' },
  ],
  client: [
    { icon: 'creators', title: 'Shortlisted creators', text: 'Review the creators our team has picked for each of your campaigns.' },
    { icon: 'check', title: 'Approve in one click', text: 'Approve or decline creators — only approved creators join your campaign.' },
    { icon: 'overview', title: 'Campaign view', text: 'See every approved creator and where each campaign stands.' },
  ],
  creator: [
    { icon: 'campaigns', title: 'Your campaigns', text: 'See the campaigns you’re part of.' },
    { icon: 'calendar', title: 'Timelines', text: 'Keep track of what’s due and when.' },
    { icon: 'sparkles', title: 'Updates', text: 'Get notified when something changes.' },
  ],
};

export default function WelcomeInProgress({ portal }) {
  const { user } = useAuth();
  const items = COMING[portal] || COMING.vendor;

  return (
    <div className="welcome-x">
      <section className="hello-card">
        <Avatar user={user} size={84} />
        <div>
          <p>Swol Media · {roleLabel(user.role)} portal</p>
          <h2>Welcome, {user.name}</h2>
          <div className="hello-tags">
            <span>{roleLabel(user.role)}</span>
            {user.company && <span>{user.company}</span>}
          </div>
        </div>
      </section>

      <section className="wip-x" style={{ padding: '40px 24px' }}>
        <span className="wip-badge-x">In development</span>
        <h2>Your dashboard is being prepared</h2>
        <p>
          The features listed below will be made available to your account in an upcoming release. You will continue to use
          the same login. In the meantime, please review your{' '}
          <Link to="../profile" className="link-btn">
            profile details
          </Link>
          .
        </p>
      </section>

      <div className="soon-grid">
        {items.map((it) => (
          <article key={it.title} className="soon-card">
            <span className="ic">
              <Icon name={it.icon} />
            </span>
            <em>Planned</em>
            <h3>{it.title}</h3>
            <p>{it.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
