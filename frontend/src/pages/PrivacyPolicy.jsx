import { useEffect } from "react";
// import "./terms.scss";

// ── Page content ────────────────────────────────────────────
const meta = {
  title: "Privacy Policy",
  intro:
    'Welcome to MematDigi ("we," "our," or "us"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website (www.mematdigi.com) or use our Social Hub application. Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site or application.',
};

const sections = [
  {
    id: "01",
    title: "Information We Collect",
    body: "We may collect information about you in a variety of ways when you use our Social Hub application. The information we may collect includes:",
    list: [
      {
        label: "Personal Data:",
        text: "Personally identifiable information, such as your name and email address, that you voluntarily give to us when registering for the application.",
      },
      {
        label: "Authentication Data (OAuth):",
        text: "When you link third-party accounts (such as Google/YouTube or Meta/Facebook/Instagram), we request explicit permission to access specific data via OAuth tokens. This includes your profile information, page management roles, and access tokens necessary to publish content on your behalf.",
      },
    ],
  },
  {
    id: "02",
    title: "How We Use Your Information",
    body: "Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the application to:",
    bullets: [
      "Authenticate your access to the MematDigi dashboard.",
      "Execute user-initiated publishing calls directly to the Facebook Graph API and YouTube Data API.",
      "Manage your linked social media accounts and scheduled posts.",
      "Send you technical notices, updates, security alerts, and support messages.",
    ],
  },
  {
    id: "03",
    title: "Disclosure of Your Information",
    body: "We strictly do not share, sell, rent, or trade your account data with third parties for their commercial purposes. We only share information in the following situations:",
    list: [
      {
        label: "Third-Party API Services:",
        text: "We share necessary commands and data directly with Meta (Facebook/Instagram) and Google (YouTube) solely to fulfill the social publishing tasks you initiate within our app.",
      },
      {
        label: "Legal Obligation:",
        text: "If required by law, we may share information to comply with legal processes or regulatory requests.",
      },
    ],
  },
  {
    id: "04",
    title: "Google API Services User Data Policy Compliance",
    body: "MematDigi's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. Our comprehensive practices regarding your Google developer platform data are detailed explicitly below:",
    list: [
      {
        label: "Data Accessed:",
        text: "Our application requests access to your YouTube channel information (youtube.readonly) to identify your managed channels and channel configuration parameters, alongside video management scopes (youtube.upload) to push video payloads. We do not access, view, or read your private personal passwords or unrelated account settings.",
      },
      {
        label: "Data Usage:",
        text: "Google platform user data is utilized exclusively inside our Social Hub dashboard to provide authentication context, display a visual list of your available publishing destinations, and securely process your automated, scheduled content distributions directly to the YouTube platform.",
      },
      {
        label: "Data Sharing:",
        text: "We enforce a zero-commercial distribution model. Your Google user records are never sold, rented, leased, shared, or transferred to third-party ad brokers, external analytical pools, or independent artificial intelligence/machine learning model training engines.",
      },
      {
        label: "Data Storage & Protection:",
        text: "All received OAuth credentials, access permissions, and refresh keys are stored securely using encryption at rest within our server stack. Any runtime connection handshakes between our system infrastructure and Google API endpoints are executed solely using high-grade HTTPS/TLS network transmission wrappers.",
      },
      {
        label: "Data Retention & Deletion:",
        text: "Authentication tokens and channel references persist only as long as your workspace account remains active. Users retain full autonomy to instantly delete all connected records by hitting the 'Disconnect' button inside our channel setup layout, completely destroying the access keys across our systems. You can systematically inspect or revoke active grants via your Google Account Permissions portal at any time.",
      },
    ],
  },
  {
    id: "05",
    title: "Third-Party Integrations and Meta Data",
    body: "Our application offers users the option to authenticate and connect their Meta professional profiles. When you link your account via Facebook Login, we temporarily request and retain specific access tokens, your profile details, and the list of pages you manage. This data is utilized solely to provide authentication context and execute your content publishing workflows.",
  },
  {
    id: "06",
    title: "Data Deletion and Revoking Access",
    body: "You retain absolute control over your synchronized credentials. You can revoke access and delete your data at any time:",
    list: [
      {
        label: "Internal Deletion:",
        text: "Log into your interface at media.mematdigi.com/dashboard. Navigate to the Accounts tab, locate your connected profile, and click Disconnect. Our system will instantly destroy all stored access tokens and drop your database records permanently.",
        link: { href: "https://media.mematdigi.com/dashboard", text: "media.mematdigi.com/dashboard" },
      },
      {
        label: "Revoking Google Access:",
        text: "You can also revoke MematDigi's access to your Google account at any time via your Google Account Security settings page.",
        link: { href: "https://myaccount.google.com/permissions", text: "myaccount.google.com/permissions" },
      },
      {
        label: "Manual Deletion Requests:",
        text: "You may also request complete data deletion by emailing us from your registered email address at hello@mematdigi.com. Our engineering team will execute your data deletion manually within 24 hours.",
      },
    ],
  },
  {
    id: "07",
    title: "Security of Your Information",
    body: "We use administrative, technical, and physical security measures to help protect your personal information and OAuth tokens. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable.",
  },
  {
    id: "08",
    title: "Contact Us",
    body: "If you have questions or comments about this Privacy Policy, please contact us at:",
    contact: [
      { label: "Email", value: "hello@mematdigi.com", href: "mailto:hello@mematdigi.com" },
      { label: "Website", value: "www.mematdigi.com", href: "https://www.mematdigi.com" },
    ],
  },
];

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = `${meta.title} | MematDigi`;

    let metaTag = document.querySelector('meta[name="description"]');
    if (!metaTag) {
      metaTag = document.createElement("meta");
      metaTag.setAttribute("name", "description");
      document.head.appendChild(metaTag);
    }
    metaTag.setAttribute("content", meta.intro);
  }, []);

  return (
    <>
      <main className="legal-page">
        <div className="legal-page__container">
          <header className="legal-page__header">
            <p className="legal-page__eyebrow">MematDigi &middot; Social Hub</p>
            <h1 className="legal-page__title">{meta.title}</h1>
            <p className="legal-page__intro">{meta.intro}</p>
          </header>

          <nav className="legal-toc" aria-label="Table of contents">
            <p className="legal-toc__label">On this page</p>
            <ol className="legal-toc__list">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#section-${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="legal-sections">
            {sections.map((s) => (
              <section
                key={s.id}
                id={`section-${s.id}`}
                className="legal-section"
              >
                <div className="legal-section__head">
                  <span className="legal-section__index">{s.id}</span>
                  <h2 className="legal-section__title">{s.title}</h2>
                </div>

                {s.body && <p className="legal-section__body">{s.body}</p>}

                {s.list && (
                  <ul className="legal-section__list">
                    {s.list.map((item, index) => (
                      <li key={item.label || index}>
                        {item.label && (
                          <span className="legal-section__list-label">
                            {item.label}
                          </span>
                        )}{" "}
                        {item.text}{" "}
                        {item.link && (
                          <a
                            href={item.link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {item.link.text}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {s.bullets && (
                  <ul className="legal-section__bullets">
                    {s.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}

                {s.contact && (
                  <ul className="legal-section__contact">
                    {s.contact.map((c) => (
                      <li key={c.label}>
                        <span className="legal-section__list-label">
                          {c.label}:
                        </span>{" "}
                        <a href={c.href}>{c.value}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}