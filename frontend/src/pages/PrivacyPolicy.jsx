import { useEffect } from "react";
// import "./terms.scss";

// ── Company details — CHECK / FILL THESE BEFORE PUBLISHING ──────────────────
const COMPANY = {
  name: "MematDigi",                                   // legal company name
  email: "hello@mematdigi.com",                        // privacy contact email
  website: "www.mematdigi.com",
  appUrl: "https://media.mematdigi.com",
  address: "", // TODO: registered office address, e.g. "Office no., Street, City, State, PIN, India"
  grievanceOfficer: "", // TODO: name of your Grievance Officer (required in India)
};
const LAST_UPDATED = "6 November 2026";

// ── Page content ────────────────────────────────────────────
const meta = {
  title: "Privacy Policy",
  intro:
    `This Privacy Policy explains how ${COMPANY.name} ("we", "our" or "us") collects, uses, shares and protects your information when you use Social Hub — our website at media.mematdigi.com and the SocialHub mobile app for Android and iOS (together, the "Service"). By using the Service you agree to this policy. If you do not agree, please do not use the Service.`,
};

const sections = [
  {
    id: "01",
    title: "Information We Collect",
    body: "We collect only what we need to run the Service:",
    list: [
      {
        label: "Account data:",
        text: "your name, email address and password when you register. Passwords are stored only as a one-way encrypted hash — we can never see them.",
      },
      {
        label: "Connected social accounts (OAuth):",
        text: "when you connect Facebook, Instagram, YouTube or X (Twitter), we receive access tokens, your profile name and ID, and the list of Pages, Instagram business accounts or channels you manage. We request only the permissions needed to publish and manage content you choose: Meta — public_profile, pages_show_list, pages_read_engagement, pages_manage_posts and, for Instagram, instagram_basic, instagram_content_publish and business_management; Google — youtube.upload, youtube.readonly and userinfo.profile; X — tweet.read, tweet.write, users.read, media.write and offline.access.",
      },
      {
        label: "Content you create:",
        text: "posts, captions, titles, hashtags, schedules, and the photos and videos you upload to publish.",
      },
      {
        label: "Data from your connected Pages:",
        text: "comments and messages received on your connected Pages (shown in the Inbox) and performance statistics such as reach and engagement (shown in Analytics).",
      },
      {
        label: "AI feature data:",
        text: "the instructions and content you give our AI features (Write with AI and the AI Agent), the AI Agent conversation history, images the AI creates or enhances for you, and any AI content you report to us.",
      },
      {
        label: "Mobile app permissions:",
        text: "the camera and microphone are used only when you choose to take a photo or record a video for a post. Photos and videos are selected through your phone's system photo picker, so the app only receives the files you pick — it cannot browse your gallery.",
      },
      {
        label: "Technical data:",
        text: "basic server logs (IP address, browser or device type, time of request and errors) used for security and troubleshooting. To keep you signed in, a login token is stored on your device (browser local storage on the web, encrypted secure storage in the mobile app). We do not use advertising cookies or third-party tracking tools.",
      },
    ],
  },
  {
    id: "02",
    title: "How We Use Your Information",
    body: "We use your information only to provide and improve the Service:",
    bullets: [
      "To create and secure your account and sign you in.",
      "To publish, schedule and manage posts on the social accounts you connect — only when you ask us to.",
      "To show your Inbox messages and Analytics for your connected Pages.",
      "To provide AI features: writing suggestions, trend and festival ideas, image creation and photo enhancement, and the AI Agent.",
      "To prevent abuse and keep the Service secure.",
      "To review reports of offensive or incorrect AI content.",
      "To send you service, security and support messages. We do not send marketing emails without your consent.",
    ],
  },
  {
    id: "03",
    title: "AI Features and Google Gemini",
    body: "Our AI features are powered by Google's Gemini API. When you use them:",
    list: [
      {
        label: "What is sent:",
        text: "the text you type (for example a topic, caption or instruction), the options you choose, and — only when you attach them in the AI Agent — your photos are sent to Google to generate the result. Live, public trend data (Google Trends, YouTube trending) may be included to suggest ideas.",
      },
      {
        label: "What is stored:",
        text: "AI Agent conversations and the images the AI creates are stored in your account until you delete them or your account. Trend-based ideas may be kept for a short time so the same request is not processed twice.",
      },
      {
        label: "Google's processing:",
        text: "Google processes this content to return the result under the Gemini API terms and the Google Privacy Policy (policies.google.com/privacy). Please do not put sensitive personal information in AI prompts.",
      },
      {
        label: "No training by us:",
        text: "we do not use your content to train our own AI models, and we never sell it.",
      },
      {
        label: "Your control:",
        text: "nothing the AI creates is published until you review it and press Post or Schedule. You can report offensive or incorrect AI content with the flag button in the AI Agent.",
      },
    ],
  },
  {
    id: "04",
    title: "How We Share Information",
    body: "We do not sell, rent or trade your personal data. We share information only in these cases:",
    list: [
      {
        label: "Social platforms you connect:",
        text: "Meta (Facebook, Instagram), Google (YouTube) and X receive the content and commands needed to carry out the publishing and management actions you request.",
      },
      {
        label: "Service providers who work for us:",
        text: "Google (Gemini AI processing), DigitalOcean (server hosting and file storage) and MongoDB Atlas (database hosting). They may only use the data to provide their service to us.",
      },
      {
        label: "Legal reasons:",
        text: "if required by law, court order or a government authority, or to protect the rights, safety and security of our users and the Service.",
      },
      {
        label: "Business transfer:",
        text: "if our business is merged or acquired, your information may be transferred to the new owner, who must continue to protect it under this policy.",
      },
    ],
  },
  {
    id: "05",
    title: "Google API Services User Data Policy Compliance",
    body: `${COMPANY.name}'s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy (developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. Our practices for Google user data:`,
    list: [
      {
        label: "Data accessed:",
        text: "your YouTube channel information (youtube.readonly) to identify the channels you manage, your basic Google profile (userinfo.profile) to show which account is connected, and video upload access (youtube.upload) to publish the videos you choose. We do not access your Google password or unrelated account data.",
      },
      {
        label: "Data usage:",
        text: "Google user data is used only inside Social Hub to show your connected channels and to publish and schedule the videos you choose to YouTube.",
      },
      {
        label: "Data sharing:",
        text: "Google user data is never sold, rented or shared with advertisers, data brokers or analytics companies, and is never used to train artificial intelligence or machine learning models.",
      },
      {
        label: "Data storage & protection:",
        text: "access and refresh tokens are encrypted at rest on our servers, and all communication with Google APIs uses HTTPS/TLS.",
      },
      {
        label: "Data retention & deletion:",
        text: "tokens and channel details are kept only while the channel is connected. Click Disconnect on the Accounts page, or delete your account, to remove them. You can also revoke access at any time at",
        link: { href: "https://myaccount.google.com/permissions", text: "myaccount.google.com/permissions" },
      },
      {
        label: "YouTube:",
        text: "by connecting YouTube you also agree to the YouTube Terms of Service (youtube.com/t/terms), and Google's handling of your data is described in the Google Privacy Policy (policies.google.com/privacy).",
      },
    ],
  },
  {
    id: "06",
    title: "Meta (Facebook and Instagram) Data",
    body: "When you connect your Meta account with Facebook Login, we receive your profile name and ID, the Pages and Instagram business accounts you manage, and access tokens for them. We use this data only to publish the content you choose, show your Page messages and statistics, and identify your connected accounts. To remove it, disconnect the account on the Accounts page, delete your SocialHub account (see section 9), or remove SocialHub under Facebook Settings → Business integrations.",
  },
  {
    id: "07",
    title: "How Long We Keep Data",
    bullets: [
      "Account data: while your account is active.",
      "Connected account tokens: until you disconnect the account or delete your SocialHub account.",
      "Posts, uploaded photos and videos: until you delete them or your account. We may remove old copies of media files from our servers after they have been published, to save storage — the published posts on the social platforms are not affected.",
      "AI Agent conversations and AI-created images: until you delete the chat or your account.",
      "AI content reports: while your account is active.",
      "Server logs: for a limited period for security and troubleshooting.",
      "When you delete your account, your data is removed from our active systems immediately. Copies in backups, if any, are overwritten within a limited period.",
    ],
  },
  {
    id: "08",
    title: "Your Rights and Choices",
    body: "You can at any time:",
    bullets: [
      "See and correct your account information in the app or website.",
      "Disconnect any social account on the Accounts page.",
      "Delete chats, posts and uploaded media.",
      "Delete your whole account and its data (see section 9).",
      "Withdraw consent by disconnecting accounts or deleting your account.",
      "Ask us for a summary of the personal data we hold about you, its correction or erasure, or raise a complaint — under India's Digital Personal Data Protection Act, 2023 and other applicable laws. Contact us using the details in section 13. You may also nominate another person to exercise these rights on your behalf.",
    ],
  },
  {
    id: "09",
    title: "Deleting Your Account and Data",
    body: "You can permanently delete your SocialHub account and the data stored with it in any of these ways:",
    list: [
      {
        label: "In the mobile app:",
        text: "More → Delete account.",
      },
      {
        label: "On the web:",
        text: "visit",
        link: { href: "https://media.mematdigi.com/delete-account", text: "media.mematdigi.com/delete-account" },
      },
      {
        label: "By email:",
        text: `write to ${COMPANY.email} from your registered email address. We will delete your data within 30 days and confirm by email.`,
      },
      {
        label: "What is deleted:",
        text: "your profile and login, connected social accounts and their tokens, posts, drafts and schedules in SocialHub, uploaded photos and videos, AI Agent chats and AI-created images, and Inbox and Analytics data stored by us. Posts that were already published on Facebook, Instagram, YouTube or X remain on those platforms — delete them there if you want them removed.",
      },
    ],
  },
  {
    id: "10",
    title: "Security of Your Information",
    body: "We protect your data with HTTPS/TLS encryption in transit, encryption of social account tokens at rest, hashed passwords and restricted access to our servers. No method of transmission or storage is 100% secure, but we work to protect your information and will notify you and the authorities of a data breach where required by law.",
  },
  {
    id: "11",
    title: "Children",
    body: "The Service is intended for people aged 18 and over, and for businesses. We do not knowingly collect personal data from anyone under 18. If you believe a child has given us personal data, contact us and we will delete it.",
  },
  {
    id: "12",
    title: "International Processing and Changes to This Policy",
    body: "Our service providers (such as Google, Meta, DigitalOcean and MongoDB Atlas) may process data on servers outside India, with safeguards required by applicable law. We may update this policy from time to time; we will change the \"Last updated\" date above and, for important changes, notify you in the app or by email.",
  },
  {
    id: "13",
    title: "Contact Us and Grievance Officer",
    body: "For questions, requests about your data, or complaints, contact us. We will acknowledge your request promptly and respond within the time required by applicable law.",
    contact: [
      { label: "Email", value: COMPANY.email, href: `mailto:${COMPANY.email}` },
      ...(COMPANY.grievanceOfficer ? [{ label: "Grievance Officer", value: `${COMPANY.grievanceOfficer} (${COMPANY.email})`, href: `mailto:${COMPANY.email}` }] : []),
      ...(COMPANY.address ? [{ label: "Address", value: COMPANY.address }] : []),
      { label: "Website", value: COMPANY.website, href: `https://${COMPANY.website}` },
      { label: "Delete your account", value: "media.mematdigi.com/delete-account", href: "https://media.mematdigi.com/delete-account" },
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
            <p className="legal-page__intro" style={{ marginTop: 8, fontSize: "0.9em", opacity: 0.75 }}>Last updated: {LAST_UPDATED}</p>
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
                        {c.href ? <a href={c.href}>{c.value}</a> : c.value}
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