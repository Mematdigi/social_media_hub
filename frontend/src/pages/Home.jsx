import React from 'react';

const Home = () => {
  return (
    <div className="memat-media-app">
      {/* HEADER SECTION */}
      <header className="header">
        <div className="header__logo">MEMAT DIGI MEDIA</div>
        <nav className="header__nav">
          <a href="#work">Work</a>
          <a href="#services">Services</a>
          <a href="#studio">Studio</a>
          <a href="#contact" className="btn-primary">Get in Touch</a>
        </nav>
      </header>

      {/* BODY SECTION */}
      <main className="main-content">
        {/* Hero Banner */}
        <section className="hero">
          <h1 className="hero__title">
            Crafting Digital <br/>
            <span className="text-highlight">Masterpieces.</span>
          </h1>
          <p className="hero__subtitle">
            Where high-end aesthetics meet elite, full-stack performance and bold visual storytelling.
          </p>
          <div className="hero__actions">
            <button className="btn-primary">View Portfolio</button>
            <button className="btn-secondary">Our Capabilities</button>
          </div>
        </section>

        {/* Selected Works / Brand Ecosystem */}
        <section className="featured-brands" id="work">
          <h2 className="section-title">Selected Works & Ecosystem</h2>
          <div className="brand-grid">
            <div className="brand-card">
              <h3>Mematgo</h3>
              <p>Apparel & Luxury Gifts — Blending Old Money and Collegiate aesthetics into a unified e-commerce experience.</p>
            </div>
            <div className="brand-card">
              <h3>Flypped</h3>
              <p>Digital Magazine — Next-gen content delivery, SEO-optimized scaling, and seamless multilingual architecture.</p>
            </div>
            <div className="brand-card">
              <h3>PolicySaath / Bima Flow</h3>
              <p>Fintech & Insurance — Modernized user flows, humanized content, and highly secure digital infrastructure.</p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER SECTION */}
      <footer className="footer">
        <div className="footer__content">
          <div className="footer__brand">
            <h2>MEMAT DIGI</h2>
            <p>Driving digital culture forward.</p>
          </div>
          <div className="footer__links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#careers">Careers</a>
          </div>
        </div>
        <div className="footer__bottom">
          <p>&copy; {new Date().getFullYear()} Memat Digi Media. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Home;