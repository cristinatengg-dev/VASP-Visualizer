import React from 'react';
import LegalDocumentLayout, { LegalSection } from '../components/legal/LegalDocumentLayout';

const EFFECTIVE_DATE = 'April 6, 2026';

const CookiePolicy: React.FC = () => (
  <LegalDocumentLayout
    title="Cookie Policy"
    subtitle="Cookie 与浏览器存储政策"
    effectiveDate={EFFECTIVE_DATE}
    currentPath="/cookie-policy"
    summary={
      <p>
        This Cookie Policy ("<strong>Policy</strong>") explains how SCI Visualizer
        ("<strong>Company</strong>," "<strong>we</strong>," "<strong>us</strong>," or
        "<strong>our</strong>") uses cookies, local storage, session storage, and similar
        browser-based technologies (collectively, "<strong>Cookies</strong>") when you
        access and use the SCI Visualizer platform (the "<strong>Service</strong>"). This
        Policy should be read in conjunction with our{' '}
        <a href="/privacy-policy" className="underline text-[#2E4A8E]">Privacy Policy</a>{' '}
        and{' '}
        <a href="/terms-of-service" className="underline text-[#2E4A8E]">Terms of Service</a>.
      </p>
    }
  >
    <LegalSection title="1. What Are Cookies">
      <p>1.1. Cookies are small data files or key-value pairs stored on your device by your web browser. They enable websites to remember information about your visit, such as authentication state, user preferences, and session context.</p>
      <p>1.2. For the purposes of this Policy, "Cookies" includes: (a) HTTP cookies (first-party and third-party); (b) browser localStorage; (c) browser sessionStorage; (d) any other client-side storage mechanism used by the Service.</p>
    </LegalSection>

    <LegalSection title="2. Categories of Cookies We Use">
      <p>2.1. <strong>Strictly Necessary Cookies.</strong> These Cookies are essential for the operation of the Service and cannot be disabled without impairing core functionality. They include:</p>
      <p className="pl-8">(a) Authentication tokens stored in localStorage to maintain your sign-in state across page loads and browser sessions;</p>
      <p className="pl-8">(b) Session identifiers required for secure communication between your browser and our servers;</p>
      <p className="pl-8">(c) Security-related cookies used for traffic management, fraud prevention, and service integrity.</p>

      <p>2.2. <strong>Functional Cookies.</strong> These Cookies enable enhanced functionality and personalization. They include:</p>
      <p className="pl-8">(a) Session storage flags (e.g., <code className="text-sm bg-gray-100 px-1 py-0.5 rounded">splash_shown</code>) that remember short-lived UI state within a single browser session;</p>
      <p className="pl-8">(b) User preference settings for visualization parameters, editor state, and workflow configuration.</p>

      <p>2.3. <strong>Performance and Analytics Cookies.</strong> We may use Cookies to monitor service performance, collect error reports, and understand aggregate usage patterns. As of the effective date of this Policy, the Service does not deploy third-party behavioral tracking or advertising cookies.</p>
    </LegalSection>

    <LegalSection title="3. Third-Party Cookies">
      <p>3.1. Certain third-party services integrated with the Service may set their own Cookies when you interact with embedded content, payment flows, or infrastructure components. These third-party Cookies are governed by the respective third party's privacy policy and cookie policy.</p>
      <p>3.2. Third parties that may set Cookies through the Service include, but are not limited to: payment processing providers (e.g., Alipay); content delivery networks; infrastructure and hosting services.</p>
      <p>3.3. We do not control the Cookies set by third parties and are not responsible for their data practices. We encourage you to review the privacy and cookie policies of these third parties.</p>
    </LegalSection>

    <LegalSection title="4. Purpose and Legal Basis">
      <p>4.1. We use Cookies for the following purposes:</p>
      <p className="pl-8">(a) <strong>Authentication and Security:</strong> to verify your identity, maintain your session, and protect against unauthorized access;</p>
      <p className="pl-8">(b) <strong>Service Functionality:</strong> to enable core features, remember your settings, and provide a consistent user experience;</p>
      <p className="pl-8">(c) <strong>Performance Monitoring:</strong> to diagnose technical issues, monitor service reliability, and improve performance;</p>
      <p className="pl-8">(d) <strong>Abuse Prevention:</strong> to enforce rate limits, detect anomalous behavior, and protect the integrity of the Service.</p>
      <p>4.2. The legal basis for our use of strictly necessary Cookies is the performance of our contract with you (the Terms of Service). For other categories, the legal basis is our legitimate interest in providing a functional, secure, and reliable Service.</p>
    </LegalSection>

    <LegalSection title="5. Your Choices and Controls">
      <p>5.1. <strong>Browser Settings.</strong> Most web browsers allow you to manage Cookie preferences through their settings. You can typically: view and delete existing Cookies; block all or specific categories of Cookies; configure notifications when new Cookies are set.</p>
      <p>5.2. <strong>Consequences of Disabling Cookies.</strong> If you disable or delete strictly necessary Cookies, you may experience the following effects: (a) automatic sign-out and inability to maintain authenticated sessions; (b) loss of saved preferences and workflow state; (c) impaired or unavailable Service features that depend on client-side storage.</p>
      <p>5.3. <strong>Do Not Track.</strong> The Service does not currently respond to "Do Not Track" browser signals, as there is no industry-wide standard for compliance. We will update this Policy if a uniform standard is adopted.</p>
    </LegalSection>

    <LegalSection title="6. Data Retention for Cookies">
      <p>6.1. <strong>Session Cookies</strong> (including sessionStorage items) are automatically deleted when you close your browser window or tab.</p>
      <p>6.2. <strong>Persistent Cookies</strong> (including localStorage items) remain on your device until: (a) they expire according to their defined lifetime; (b) you manually delete them through your browser settings; (c) the Service programmatically removes them (e.g., upon logout).</p>
      <p>6.3. Authentication tokens stored by the Service have a maximum validity period of twenty-four (24) hours, after which re-authentication is required.</p>
    </LegalSection>

    <LegalSection title="7. Changes to This Policy">
      <p>7.1. We may update this Cookie Policy from time to time to reflect changes in the technologies we use, the Cookies we deploy, or applicable legal requirements. When material changes are made, the revised Policy will be posted on this page with an updated effective date.</p>
      <p>7.2. Your continued use of the Service after the posting of changes constitutes your acceptance of the revised Policy.</p>
    </LegalSection>

    <LegalSection title="8. Contact Information">
      <p>8.1. If you have questions or concerns about this Cookie Policy or our use of Cookies, please contact us through the Service or at the email address provided on our website.</p>
    </LegalSection>
  </LegalDocumentLayout>
);

export default CookiePolicy;
