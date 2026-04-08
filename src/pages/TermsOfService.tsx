import React from 'react';
import LegalDocumentLayout, { LegalSection } from '../components/legal/LegalDocumentLayout';

const EFFECTIVE_DATE = 'April 6, 2026';

const TermsOfService: React.FC = () => (
  <LegalDocumentLayout
    title="Terms of Service"
    subtitle="服务条款"
    effectiveDate={EFFECTIVE_DATE}
    currentPath="/terms-of-service"
    summary={
      <p>
        These Terms of Service ("<strong>Terms</strong>") constitute a legally binding agreement
        between you ("<strong>User</strong>," "<strong>you</strong>," or "<strong>your</strong>")
        and SCI Visualizer ("<strong>Company</strong>," "<strong>we</strong>," "<strong>us</strong>,"
        or "<strong>our</strong>") governing your access to and use of the SCI Visualizer platform,
        including all associated software, agents, APIs, documentation, and services (collectively,
        the "<strong>Service</strong>"). By accessing or using the Service, you acknowledge that you
        have read, understood, and agree to be bound by these Terms. If you do not agree, you must
        not access or use the Service.
      </p>
    }
  >
    <LegalSection title="1. Definitions">
      <p>1.1. "<strong>Service</strong>" means the SCI Visualizer web-based platform and all related tools, including but not limited to structure modeling agents, compute orchestration agents, rendering engines, scientific illustration generators, data retrieval agents, and any associated APIs, documentation, and support services.</p>
      <p>1.2. "<strong>User Content</strong>" means all data, files, structures, prompts, parameters, images, and other materials that you upload to, create with, or submit through the Service.</p>
      <p>1.3. "<strong>Generated Output</strong>" means any visualization, image, report, structure file, AI-generated illustration, or other output produced by the Service based on your User Content or instructions.</p>
      <p>1.4. "<strong>Subscription Plan</strong>" means the tier of service access selected by the User, including Standard (Free), Professional, and Enterprise plans, each with defined quotas, features, and pricing.</p>
    </LegalSection>

    <LegalSection title="2. Eligibility and Account Registration">
      <p>2.1. You must be at least eighteen (18) years of age or the age of legal majority in your jurisdiction to use the Service. By using the Service, you represent and warrant that you meet this requirement.</p>
      <p>2.2. To access certain features, you must register for an account by providing a valid email address and completing verification. You agree to: (a) provide accurate and complete registration information; (b) maintain the security of your account credentials; (c) promptly notify us of any unauthorized use of your account.</p>
      <p>2.3. You are solely responsible for all activities that occur under your account, whether or not authorized by you. We reserve the right to suspend or terminate accounts that violate these Terms or exhibit signs of unauthorized access.</p>
      <p>2.4. Account access is limited to three (3) concurrent active sessions per User unless otherwise specified in your Subscription Plan.</p>
    </LegalSection>

    <LegalSection title="3. Permitted Use and Restrictions">
      <p>3.1. <strong>Permitted Use.</strong> Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for lawful research, education, engineering, product evaluation, and internal communication purposes.</p>
      <p>3.2. <strong>Restrictions.</strong> You shall not, and shall not permit any third party to:</p>
      <p className="pl-8">(a) upload or transmit any malicious code, viruses, or harmful data to or through the Service;</p>
      <p className="pl-8">(b) attempt to gain unauthorized access to any part of the Service, its servers, or connected systems;</p>
      <p className="pl-8">(c) reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code of the Service, except to the extent expressly permitted by applicable law;</p>
      <p className="pl-8">(d) use the Service to process data that you do not have the legal right to use or disclose;</p>
      <p className="pl-8">(e) circumvent any access controls, usage limits, rate limits, or security mechanisms;</p>
      <p className="pl-8">(f) submit workloads that violate export-control laws, sanctions, or other applicable regulations;</p>
      <p className="pl-8">(g) use the Service for any purpose that is unlawful, fraudulent, or harmful, or in connection with any unlawful, fraudulent, or harmful activity.</p>
    </LegalSection>

    <LegalSection title="4. User Content and Data Rights">
      <p>4.1. <strong>Ownership.</strong> You retain all right, title, and interest in and to your User Content. Nothing in these Terms transfers ownership of your User Content to us.</p>
      <p>4.2. <strong>License Grant.</strong> By submitting User Content to the Service, you grant the Company a limited, non-exclusive, worldwide, royalty-free license to host, transmit, process, cache, transform, and display your User Content solely for the purpose of operating, maintaining, and improving the Service, including authentication, visualization, agent execution, export, debugging, and security operations.</p>
      <p>4.3. <strong>Responsibility.</strong> You represent and warrant that: (a) you own or have obtained all necessary rights, licenses, and permissions to submit your User Content; (b) your User Content does not infringe, misappropriate, or violate any third party's intellectual property rights, privacy rights, or other legal rights.</p>
    </LegalSection>

    <LegalSection title="5. Intellectual Property">
      <p>5.1. The Service, including its software, algorithms, models, user interface, design, documentation, and branding, is and shall remain the exclusive property of the Company and its licensors. These Terms do not convey any ownership interest in or to the Service.</p>
      <p>5.2. Subject to these Terms and any applicable third-party rights, you may use Generated Output derived from your own User Content for your internal research, publication preparation, project communication, and other lawful purposes.</p>
      <p>5.3. Generated Output may reflect model behavior, upstream data sources, or AI-generated content. You are solely responsible for reviewing and validating all Generated Output before relying on it for publication, patent filings, safety decisions, regulatory submissions, or production workflows.</p>
    </LegalSection>

    <LegalSection title="6. Fees, Subscription Plans, and Payment">
      <p>6.1. Access to certain features of the Service requires a paid Subscription Plan. Subscription fees, quotas, and pricing are as described on the Service and may be updated from time to time with reasonable notice.</p>
      <p>6.2. All fees are stated in Chinese Yuan (CNY) unless otherwise indicated. Payments are processed through our authorized payment providers. By purchasing a Subscription Plan, you agree to pay all applicable fees.</p>
      <p>6.3. You shall not circumvent, manipulate, or abuse any quota, credit, or access control mechanism. Unused quota does not roll over between billing periods unless explicitly stated in your Subscription Plan.</p>
      <p>6.4. We reserve the right to modify pricing with thirty (30) days' advance notice. Continued use of the Service after such notice constitutes acceptance of the modified pricing.</p>
    </LegalSection>

    <LegalSection title="7. Availability, Beta Features, and Modifications">
      <p>7.1. The Service may include features designated as "Beta," "Preview," or "Experimental." Such features are provided on an as-is basis, may contain errors, and may be modified, suspended, or discontinued at any time without notice.</p>
      <p>7.2. We reserve the right to modify, update, or discontinue any part of the Service at any time. We will make commercially reasonable efforts to provide notice of material changes.</p>
      <p>7.3. We do not guarantee uninterrupted or error-free operation of the Service. Scheduled and unscheduled maintenance, infrastructure changes, and force majeure events may result in temporary unavailability.</p>
    </LegalSection>

    <LegalSection title="8. Disclaimer of Warranties">
      <p>8.1. THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE COMPANY EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING OR USAGE OF TRADE.</p>
      <p>8.2. WITHOUT LIMITING THE FOREGOING, THE COMPANY DOES NOT WARRANT THAT: (A) THE SERVICE WILL MEET YOUR REQUIREMENTS; (B) THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE; (C) ANY RESULTS OBTAINED FROM USE OF THE SERVICE WILL BE ACCURATE, RELIABLE, OR COMPLETE; (D) ANY GENERATED OUTPUT WILL BE FREE FROM SCIENTIFIC ERRORS, OMISSIONS, OR INCONSISTENCIES.</p>
    </LegalSection>

    <LegalSection title="9. Limitation of Liability">
      <p>9.1. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY, ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF DATA, LOSS OF PROFITS, LOSS OF RESEARCH OPPORTUNITY, PUBLICATION DELAY, BUSINESS INTERRUPTION, OR COST OF SUBSTITUTE SERVICES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE, REGARDLESS OF THE THEORY OF LIABILITY AND EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
      <p>9.2. IN NO EVENT SHALL THE COMPANY'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS EXCEED THE GREATER OF: (A) THE TOTAL AMOUNT PAID BY YOU TO THE COMPANY IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM; OR (B) ONE HUNDRED CHINESE YUAN (CNY 100).</p>
    </LegalSection>

    <LegalSection title="10. Indemnification">
      <p>10.1. You agree to indemnify, defend, and hold harmless the Company and its affiliates, officers, directors, employees, and agents from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Service; (b) your User Content; (c) your violation of these Terms; (d) your violation of any applicable law or regulation; (e) your violation of any third party's rights.</p>
    </LegalSection>

    <LegalSection title="11. Suspension and Termination">
      <p>11.1. We may suspend or terminate your access to the Service immediately, without prior notice or liability, if: (a) you breach any provision of these Terms; (b) we are required to do so by law; (c) we reasonably believe that your use poses a risk to the Service, other users, or third parties.</p>
      <p>11.2. You may terminate your account at any time by ceasing to use the Service and contacting us to request account deletion.</p>
      <p>11.3. Upon termination: (a) your right to access and use the Service shall immediately cease; (b) we may delete your User Content and account data after a commercially reasonable retention period; (c) all provisions of these Terms that by their nature should survive termination shall survive, including Sections 4, 5, 8, 9, 10, and 12.</p>
    </LegalSection>

    <LegalSection title="12. Governing Law and Dispute Resolution">
      <p>12.1. These Terms shall be governed by and construed in accordance with the laws of the People's Republic of China, without regard to its conflict of laws principles.</p>
      <p>12.2. Any dispute arising out of or relating to these Terms or the Service shall first be resolved through good-faith negotiation between the parties. If the dispute cannot be resolved through negotiation within thirty (30) days, either party may submit the dispute to the competent court of the jurisdiction where the Company is domiciled.</p>
    </LegalSection>

    <LegalSection title="13. General Provisions">
      <p>13.1. <strong>Entire Agreement.</strong> These Terms, together with the Privacy Policy and Cookie Policy, constitute the entire agreement between you and the Company regarding the Service and supersede all prior agreements and understandings.</p>
      <p>13.2. <strong>Severability.</strong> If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.</p>
      <p>13.3. <strong>Waiver.</strong> The failure of the Company to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision.</p>
      <p>13.4. <strong>Assignment.</strong> You may not assign or transfer these Terms or your rights hereunder without our prior written consent. We may assign these Terms without restriction.</p>
      <p>13.5. <strong>Amendments.</strong> We reserve the right to modify these Terms at any time. Material changes will be communicated by posting the revised Terms on the Service with an updated effective date. Your continued use of the Service after such posting constitutes acceptance of the modified Terms.</p>
      <p>13.6. <strong>Contact.</strong> For questions regarding these Terms, please contact us through the Service or at the email address provided on our website.</p>
    </LegalSection>
  </LegalDocumentLayout>
);

export default TermsOfService;
