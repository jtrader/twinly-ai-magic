import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/copyright")({
  head: () => ({ meta: [{ title: "Copyright & IP Complaint Procedure — Twinly.life" }, { name: "description", content: "How to report copyright, trade mark, or publicity-rights complaints for Twinly.life." }] }),
  component: () => (
    <AppShell>
      <Legal title="Copyright and IP Complaint Procedure">
        <h2>1. Purpose</h2>
        <p>This Procedure explains how to report copyright, trade mark, publicity-rights, or other IP complaints relating to content on Twinly. It is separate from the Deepfake Removal and Takedown Policy, which addresses suspected non-consensual synthetic media.</p>
        <h2>2. What this Procedure covers</h2>
        <p>Alleged infringement such as unauthorised copying, redistribution, leaking, resale, reposting, display, or misuse of creator content, platform content, trade marks, or copyrighted works.</p>
        <h2>3. How to submit a complaint</h2>
        <p>Submit a complaint through Twinly's <strong>TakedownRequest</strong> intake system or by emailing <strong>{LEGAL.contact.copyright}</strong>. Include:</p>
        <ul>
          <li>the complainant's name and contact details;</li>
          <li>identification of the work or right claimed to be infringed;</li>
          <li>the URL, account, content ID, or other location of the allegedly infringing material;</li>
          <li>evidence of ownership or authority to act;</li>
          <li>a statement that the complaint is made in good faith and that the information provided is accurate;</li>
          <li>the complainant's physical or electronic signature.</li>
        </ul>
        <h2>4. Designated agent and regional procedures</h2>
        <p>For US DMCA notices, Twinly's designated agent details will be added here after DMCA agent registration is completed. Until registration is confirmed, Twinly does not represent that DMCA safe-harbour process is available. For UK, EU, Australian, and other regional complaints, Twinly may request equivalent information and process the complaint under applicable local law, platform rules, and hosting-provider requirements.</p>
        <h2>5. Review and action</h2>
        <p>Twinly may remove, restrict, disable, preserve, or maintain content after reviewing a complaint. Twinly may request additional information, notify the affected user, refer matters to legal counsel, or decline incomplete or unsupported complaints.</p>
        <h2>6. Counter-notice</h2>
        <p>A user whose content is removed or disabled may submit a counter-notice to <strong>{LEGAL.contact.counterNotice}</strong>. Include the user's contact details, identification of the removed material, the basis for disputing the complaint, any evidence of ownership/licence/consent/fair dealing/fair use, a statement of accuracy and good faith, and the user's physical or electronic signature. Twinly may restore, maintain removal, or continue restriction depending on applicable law, risk, evidence, and whether legal proceedings are commenced.</p>
        <h2>7. Repeat infringer policy</h2>
        <p>Twinly may suspend or terminate users who repeatedly infringe rights or repeatedly submit infringing material. Twinly may also terminate users who misuse the complaint process through fraudulent, abusive, or bad-faith notices.</p>
        <h2>8. Records</h2>
        <p>Twinly may retain complaint records, evidence, correspondence, decisions, and audit logs for legal, safety, compliance, and dispute-resolution purposes.</p>
      </Legal>
    </AppShell>
  ),
});