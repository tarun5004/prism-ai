import { useState } from 'react';
import BrandMark from '../../shared/BrandMark.jsx';
import RouteLink from '../../shared/RouteLink.jsx';
import PrismScene from './PrismScene.jsx';
import EvidencePreview from './EvidencePreview.jsx';
import FeatureCatalogue from './FeatureCatalogue.jsx';
import FeatureShowcase from './FeatureShowcase.jsx';
import GettingStarted from './GettingStarted.jsx';
import AzureArchitecture from './AzureArchitecture.jsx';
import HomeConnection from './HomeConnection.jsx';
import ContextPipeline from './ContextPipeline.jsx';
import AgentWorkflow from './AgentWorkflow.jsx';
import DeliveryPipeline from './DeliveryPipeline.jsx';
import MotionLabel from './MotionLabel.jsx';
import CursorCubes from './CursorCubes.jsx';
import LandingFooter, { ClosingPerspective } from './LandingFooter.jsx';
import './landing.css';

export default function LandingPage({ onNavigate, ...connection }) {
  const [activeFeature, setActiveFeature] = useState(0);
  const trial = (small = false) => (
    <RouteLink
      className={`landing-cta${small ? ' landing-cta-small' : ''}`}
      to="/app"
      onNavigate={onNavigate}
    >
      Try it for free <span aria-hidden="true">↗</span>
    </RouteLink>
  );
  return (
    <div className="landing">
      <CursorCubes />
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>
      <div className="announcement">
        <span className="announcement-dot" /> A new perspective on pull requests.
        <a href="#review-preview">Explore the interactive preview ↗</a>
      </div>
      <header className="landing-header">
        <nav className="landing-nav landing-width" aria-label="Main navigation">
          <RouteLink
            className="brand-lockup"
            to="/"
            onNavigate={onNavigate}
            aria-label="PRism AI home"
          >
            <BrandMark />
            <span>
              PRism<span className="brand-ai"> AI</span>
            </span>
          </RouteLink>
          <div className="landing-nav-links">
            <a href="#features">
              <MotionLabel>Features</MotionLabel>
            </a>
            <a href="#context-pipeline">
              <MotionLabel>Context</MotionLabel>
            </a>
            <a href="#getting-started">
              <MotionLabel>Get started</MotionLabel>
            </a>
            <a href="#architecture">
              <MotionLabel>Architecture</MotionLabel>
            </a>
            <a
              href="https://github.com/tarun5004/prism-ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MotionLabel>View source ↗</MotionLabel>
            </a>
          </div>
          {trial(true)}
        </nav>
      </header>
      <main id="landing-main" className="landing-width landing-main">
        <section className="landing-hero">
          <div className="hero-kicker">
            <span>PULL REQUEST INTELLIGENCE</span>
            <span>CONTEXT. CODE. CLARITY.</span>
          </div>
          <h1 tabIndex={-1}>
            Understand the change
            <span className="hero-asterisk" aria-hidden="true">
              ✳
            </span>
            <span className="sr-only">.</span>
          </h1>
          <div className="hero-bottom">
            <p className="hero-subheading">
              Before you merge.
              <br />
              <em>A different perspective.</em>
            </p>
            <div className="hero-copy">
              <p>
                Turn a pull request into a clearer picture.
                <br />
                Explore the diff, the context and the risk—with evidence you can inspect.
              </p>
              <div className="hero-actions">
                {trial()}
                <RouteLink className="quiet-link" to="/demo" onNavigate={onNavigate}>
                  See a sample review ↗
                </RouteLink>
              </div>
              <small>Personal demo · GitHub App + AI · Human judgment stays in charge</small>
            </div>
          </div>
        </section>
        <PrismScene />
        <div className="capability-strip">
          <span>MADE FOR THE MOMENT BEFORE MERGE</span>
          <span>GitHub PRs</span>
          <span>Bounded context</span>
          <span>Evidence-backed feedback</span>
        </div>
        <EvidencePreview />
        <ContextPipeline />
        <AgentWorkflow />
        <FeatureCatalogue />
        <div className="showcase-section">
          <p className="landing-eyebrow">EXPLORE THE WORKSPACE / HOVER, FOCUS OR TAP</p>
          <FeatureShowcase activeIndex={activeFeature} onSelect={setActiveFeature} />
        </div>
        <GettingStarted onNavigate={onNavigate} />
        <HomeConnection {...connection} onNavigate={onNavigate} />
        <AzureArchitecture />
        <DeliveryPipeline />
        <ClosingPerspective onNavigate={onNavigate} />
      </main>
      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
}
