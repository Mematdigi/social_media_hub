import { useEffect } from "react";
// import "./terms.scss";

// ── Page content ────────────────────────────────────────────
const meta = {
  title: "Terms and Conditions",
  intro:
    "Welcome to MematDigi. These Terms and Conditions govern your use of our website and Social Hub application. Please read them carefully before accessing or using our connected services.",
};

const sections = [
  {
    id: "01",
    title: "Acceptance of Terms",
    body: "By accessing and using the Memat Digi Social Hub dashboard and services at www.mematdigi.com, you agree to be bound by these Terms and Conditions. If you do not agree with any of these terms, you are prohibited from using or accessing this site and its connected services.",
  },
  {
    id: "02",
    title: "Third-Party Platform Integrations (Meta & Google/YouTube)",
    body: "Our service enables you to connect third-party developer platform architectures, including Meta platforms (Facebook and Instagram) and Google platform APIs (YouTube Data API), to schedule and distribute digital media assets. By connecting these API integrations:",
    bullets: [
      "You acknowledge that Memat Digi is an independent application layer and is not sponsored, endorsed, or administered by Meta Platforms, Inc. or Google LLC.",
      "You agree to comply strictly with the Facebook Terms of Service and Meta Platform Policies when publishing content through our dashboard.",
      "By utilizing our YouTube automated distribution features, you explicitly agree to be bound by the official YouTube Terms of Service.",
      "You are solely responsible for the content, asset ownership rights, metadata descriptions, and videos you upload and publish through our API connections.",
    ],
    list: [
      {
        label: "YouTube Terms of Service Reference:",
        text: "To review the mandatory platform governance terms that apply to your connected channel operations, please visit the ",
        link: { href: "https://www.youtube.com/t/terms", text: "YouTube Terms of Service (https://www.youtube.com/t/terms)" },
      },
    ],
  },
  {
    id: "03",
    title: "User Behavior and Acceptable Use",
    body: "When using the Memat Digi platform, you agree that you will not:",
    bullets: [
      "Publish or distribute content that is fraudulent, hateful, threatening, pornographic, defamatory, or promotes violence.",
      "Use our automated publishing tools to spam third-party networks or violate the API rate limits of connected platforms.",
      "Attempt to reverse engineer, decompile, or copy the proprietary software and publishing algorithms contained within the Social Hub.",
      "Upload media or videos that infringe upon the intellectual property or copyright of any third party.",
    ],
  },
  {
    id: "04",
    title: "Account Termination and Disconnection",
    body: "We reserve the right to suspend or terminate your access to the Memat Digi Social Hub immediately, without prior notice, if you breach these Terms. You may also terminate this agreement at any time by navigating to your dashboard's Accounts section and clicking Disconnect to instantly revoke our application's access to your social media profiles and trigger the deletion of your access tokens.",
  },
  {
    id: "05",
    title: "Disclaimer of Warranties",
    body: 'The materials and API integrations on Memat Digi\'s site are provided "as is". We do not guarantee uninterrupted connectivity with third-party networks (such as Facebook Graph API or YouTube Data API outages) and make no warranties regarding the exactness, likely outcomes, or reliability of automated social media publishing.',
  },
  {
    id: "06",
    title: "Limitations of Liability",
    body: "In no event shall Memat Digi or its suppliers be liable for any damages (including, without limitation, damages for loss of data, loss of followers, or business interruption) arising out of the use or inability to use our dashboard, or due to rejected API requests from connected social media platforms.",
  },
  {
    id: "07",
    title: "Revisions and Modifications",
    body: "Memat Digi may revise these Terms of Service for its website at any time without prior notice. By using this website, you are agreeing to be bound by the current version of these Terms and Conditions. We reserve the right to modify or discontinue features of the Social Hub application to remain compliant with third-party Developer Policies.",
  },
  {
    id: "08",
    title: "Governing Law",
    body: "Any claim relating to the Memat Digi website shall be governed by the laws of Delhi, India, without regard to its conflict of law provisions.",
  },
];

export default function TermsAndConditions() {
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

                {s.bullets && (
                  <ul className="legal-section__bullets">
                    {s.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}

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