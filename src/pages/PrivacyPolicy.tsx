import React from 'react';
import LegalDocumentLayout, { LegalSection } from '../components/legal/LegalDocumentLayout';

const EFFECTIVE_DATE = 'April 6, 2026';

const PrivacyPolicy: React.FC = () => (
  <LegalDocumentLayout
    title="Privacy Policy"
    subtitle="隐私政策"
    effectiveDate={EFFECTIVE_DATE}
    currentPath="/privacy-policy"
    summary={
      <p>
        This Privacy Policy ("<strong>Policy</strong>") describes how SCI Visualizer
        ("<strong>Company</strong>," "<strong>we</strong>," "<strong>us</strong>," or
        "<strong>our</strong>") collects, uses, stores, shares, and protects information
        obtained from users ("<strong>User</strong>," "<strong>you</strong>," or
        "<strong>your</strong>") of the SCI Visualizer platform and all related services
        (the "<strong>Service</strong>"). By accessing or using the Service, you consent to
        the collection and use of information as described in this Policy. If you do not
        agree with this Policy, you must not use the Service.
      </p>
    }
  >
    <LegalSection title="1. Information We Collect">
      <p>1.1. <strong>Account Information.</strong> When you register for an account, we collect your email address and generate account identifiers. We use email-based verification codes for authentication.</p>
      <p>1.2. <strong>User Content.</strong> We collect and process files, data, and materials that you upload to or create through the Service, including but not limited to: POSCAR, CONTCAR, CIF, XYZ, and XDATCAR structure files; prompts and agent instructions; calculation parameters and configuration settings; generated images, videos, and reports.</p>
      <p>1.3. <strong>Usage Data.</strong> We automatically collect information about your interaction with the Service, including: IP address and approximate geographic location; device type, operating system, and browser information; pages visited, features used, and timestamps; export history and quota usage.</p>
      <p>1.4. <strong>Payment Information.</strong> If you purchase a Subscription Plan or make other payments, our authorized payment processors may collect payment-related information. We store order records and transaction metadata but do not directly store payment card numbers or payment account credentials.</p>
      <p>1.5. <strong>Communication Data.</strong> When you contact us for support or provide feedback, we collect the contents of your communications and any associated metadata.</p>
    </LegalSection>

    <LegalSection title="2. How We Use Your Information">
      <p>2.1. We use the information we collect for the following purposes:</p>
      <p className="pl-8">(a) <strong>Service Operation:</strong> to authenticate users, process requests, execute agent workflows, generate outputs, and deliver core Service functionality;</p>
      <p className="pl-8">(b) <strong>Account Management:</strong> to manage your account, enforce access controls, track quota usage, and process subscriptions and payments;</p>
      <p className="pl-8">(c) <strong>Security and Integrity:</strong> to detect, prevent, and respond to fraud, abuse, security incidents, and technical issues;</p>
      <p className="pl-8">(d) <strong>Service Improvement:</strong> to monitor performance, diagnose errors, analyze usage patterns, and improve the quality, reliability, and functionality of the Service;</p>
      <p className="pl-8">(e) <strong>Legal Compliance:</strong> to comply with applicable laws, regulations, legal processes, or enforceable governmental requests;</p>
      <p className="pl-8">(f) <strong>Communication:</strong> to send service-related notices, verification codes, security alerts, and support responses.</p>
    </LegalSection>

    <LegalSection title="3. Information Sharing and Disclosure">
      <p>3.1. We do not sell, rent, or trade your personal information to third parties for marketing purposes.</p>
      <p>3.2. We may share information with third parties only in the following circumstances:</p>
      <p className="pl-8">(a) <strong>Service Providers:</strong> with hosting providers, infrastructure vendors, payment processors, and other service providers who assist in operating the Service, subject to confidentiality obligations;</p>
      <p className="pl-8">(b) <strong>Legal Requirements:</strong> when required by law, regulation, legal process, or governmental request, or when we believe disclosure is necessary to protect our rights, your safety, or the safety of others;</p>
      <p className="pl-8">(c) <strong>Business Transfers:</strong> in connection with a merger, acquisition, financing, reorganization, bankruptcy, or sale of all or a portion of our assets;</p>
      <p className="pl-8">(d) <strong>Institutional Administrators:</strong> if your access is provided through an institution, laboratory, or enterprise deployment, your administrator may have access to account and usage information as defined by your institutional agreement;</p>
      <p className="pl-8">(e) <strong>With Your Consent:</strong> with your explicit consent or at your direction.</p>
    </LegalSection>

    <LegalSection title="4. Data Retention">
      <p>4.1. We retain your information for as long as reasonably necessary to fulfill the purposes described in this Policy, including to provide the Service, comply with legal obligations, resolve disputes, and enforce our agreements.</p>
      <p>4.2. Specific retention periods may vary by data category:</p>
      <p className="pl-8">(a) Account information: retained for the duration of your account and a commercially reasonable period thereafter;</p>
      <p className="pl-8">(b) User Content and Generated Output: retained for the duration of your account unless earlier deletion is requested or required;</p>
      <p className="pl-8">(c) Usage and technical logs: retained for up to twenty-four (24) months for security, debugging, and service improvement purposes;</p>
      <p className="pl-8">(d) Payment records: retained as required by applicable tax and financial regulations.</p>
      <p>4.3. Upon account termination, we will delete or anonymize your personal information within a commercially reasonable timeframe, except where retention is required by law.</p>
    </LegalSection>

    <LegalSection title="5. Data Security">
      <p>5.1. We implement commercially reasonable technical and organizational measures designed to protect information against unauthorized access, alteration, disclosure, or destruction. These measures include but are not limited to: encryption of data in transit (TLS/SSL); access controls and authentication mechanisms; rate limiting and abuse prevention systems; infrastructure monitoring and incident response procedures.</p>
      <p>5.2. Despite our efforts, no method of electronic transmission or storage is completely secure. We cannot guarantee absolute security of your information. You are responsible for maintaining the confidentiality of your account credentials and for restricting access to your devices.</p>
      <p>5.3. If you become aware of any unauthorized access to your account or any security breach, you must notify us immediately.</p>
    </LegalSection>

    <LegalSection title="6. Your Rights and Choices">
      <p>6.1. Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
      <p className="pl-8">(a) <strong>Access:</strong> the right to request a copy of the personal information we hold about you;</p>
      <p className="pl-8">(b) <strong>Correction:</strong> the right to request correction of inaccurate or incomplete personal information;</p>
      <p className="pl-8">(c) <strong>Deletion:</strong> the right to request deletion of your personal information, subject to legal retention requirements;</p>
      <p className="pl-8">(d) <strong>Portability:</strong> the right to receive your personal information in a structured, commonly used, machine-readable format;</p>
      <p className="pl-8">(e) <strong>Restriction:</strong> the right to request restriction of processing of your personal information under certain circumstances;</p>
      <p className="pl-8">(f) <strong>Objection:</strong> the right to object to processing of your personal information under certain circumstances.</p>
      <p>6.2. To exercise any of these rights, please contact us using the information provided in Section 9. We will respond to your request within the timeframe required by applicable law.</p>
      <p>6.3. You may control certain browser-side storage through your browser settings, although doing so may affect sign-in persistence and core Service functionality.</p>
    </LegalSection>

    <LegalSection title="7. International Data Transfers">
      <p>7.1. The Service is primarily operated from servers located in the People's Republic of China. If you access the Service from outside this jurisdiction, you acknowledge and consent to the transfer of your information to, and processing of your information in, the People's Republic of China and any other jurisdiction where our service providers operate.</p>
      <p>7.2. When transferring data across borders, we implement appropriate safeguards to ensure an adequate level of protection for your personal information in compliance with applicable data protection laws.</p>
    </LegalSection>

    <LegalSection title="8. Children's Privacy">
      <p>8.1. The Service is not directed to individuals under the age of eighteen (18). We do not knowingly collect personal information from children under 18. If we become aware that we have collected personal information from a child under 18, we will take steps to delete such information promptly.</p>
    </LegalSection>

    <LegalSection title="9. Contact Information">
      <p>9.1. If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us through the Service or at the email address provided on our website.</p>
    </LegalSection>

    <LegalSection title="10. Changes to This Policy">
      <p>10.1. We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. When we make material changes, we will post the revised Policy on this page with an updated effective date.</p>
      <p>10.2. Your continued use of the Service after the posting of changes constitutes your acceptance of such changes. We encourage you to review this Policy periodically.</p>
    </LegalSection>
  </LegalDocumentLayout>
);

export default PrivacyPolicy;
