import { createElement as h, type ReactElement } from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToStream,
} from '@react-pdf/renderer'
import { createHash } from 'crypto'
import type { ConsentTemplate, ConsentPDFParams } from './types'

const MARGIN = 40

const styles = StyleSheet.create({
  page: {
    padding: MARGIN,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: '#1e293b',
    lineHeight: 1.35,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  logo: {
    width: 80,
    height: 60,
    objectFit: 'contain',
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#475569',
    marginTop: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    color: '#0f172a',
    marginTop: 6,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 11,
    textAlign: 'center',
    color: '#475569',
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoCell: {
    width: '50%',
    flexDirection: 'row',
  },
  infoLabel: {
    fontFamily: 'Helvetica-Bold',
    color: '#334155',
    fontSize: 9,
    width: 80,
  },
  infoValue: {
    fontSize: 9,
    color: '#0f172a',
    flex: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginTop: 10,
    marginBottom: 6,
  },
  sectionTitleWarning: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#b91c1c',
    marginTop: 10,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 9,
    color: '#334155',
    textAlign: 'justify',
    marginBottom: 6,
  },
  sectionBodyWarning: {
    fontSize: 9,
    color: '#991b1b',
    textAlign: 'justify',
    marginBottom: 6,
  },
  dynamicTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginTop: 10,
    marginBottom: 6,
  },
  table: {
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cbd5e1',
    paddingVertical: 4,
  },
  tableCell: {
    width: '50%',
    flexDirection: 'row',
    paddingRight: 8,
  },
  tableLabel: {
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
    fontSize: 9,
    width: 90,
  },
  tableValue: {
    fontSize: 9,
    color: '#0f172a',
    flex: 1,
  },
  photoConsent: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  photoConsentGiven: {
    color: '#047857',
  },
  photoConsentDeclined: {
    color: '#b91c1c',
  },
  declarationBox: {
    marginTop: 10,
    marginBottom: 10,
    padding: 10,
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    backgroundColor: '#f8fafc',
  },
  declarationTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  declarationText: {
    fontSize: 9,
    color: '#334155',
    textAlign: 'justify',
    lineHeight: 1.4,
  },
  signaturesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 10,
  },
  signatureCol: {
    flexDirection: 'column',
  },
  signatureBox: {
    width: 150,
    height: 70,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  signatureBoxLarge: {
    width: 180,
    height: 70,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  signatureLabel: {
    fontSize: 8,
    color: '#475569',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 180,
  },
  signatureImage: {
    width: '95%',
    height: '95%',
    objectFit: 'contain',
  },
  auditFooter: {
    marginTop: 14,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: '#94a3b8',
  },
  auditText: {
    fontSize: 7.5,
    color: '#64748b',
    textAlign: 'center',
  },
  pageFooter: {
    position: 'absolute',
    bottom: 18,
    left: MARGIN,
    right: MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#64748b',
  },
  footerText: {
    fontSize: 7.5,
    color: '#64748b',
  },
  pageNumberText: {
    fontSize: 7.5,
    color: '#64748b',
  },
})

function calculateAge(dob: string | null): string {
  if (!dob) return 'N/A'
  const birthDate = new Date(dob)
  if (isNaN(birthDate.getTime())) return 'N/A'
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return `${age}`
}

function formatISTDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatISTTime(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function formatISTDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function uhid(patientId: string): string {
  return patientId.replace(/-/g, '').toUpperCase().slice(0, 8)
}

function renderValue(value: string | boolean | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function buildInfoBox(
  patient: ConsentPDFParams['patient'],
  staffWitness: ConsentPDFParams['staffWitness'],
  signedAt: Date
) {
  const age = calculateAge(patient.date_of_birth)
  const genderLabel = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : 'N/A'
  return h(
    View,
    { style: styles.infoBox },
    h(
      View,
      { style: styles.infoRow },
      h(
        View,
        { style: styles.infoCell },
        h(Text, { style: styles.infoLabel }, 'Patient Name'),
        h(Text, { style: styles.infoValue }, patient.full_name || 'N/A')
      ),
      h(
        View,
        { style: styles.infoCell },
        h(Text, { style: styles.infoLabel }, 'Age / Sex'),
        h(Text, { style: styles.infoValue }, `${age} / ${genderLabel}`)
      )
    ),
    h(
      View,
      { style: styles.infoRow },
      h(
        View,
        { style: styles.infoCell },
        h(Text, { style: styles.infoLabel }, 'Contact'),
        h(Text, { style: styles.infoValue }, patient.phone || 'N/A')
      ),
      h(
        View,
        { style: styles.infoCell },
        h(Text, { style: styles.infoLabel }, 'UHID'),
        h(Text, { style: styles.infoValue }, uhid(patient.id))
      )
    ),
    h(
      View,
      { style: styles.infoRow },
      h(
        View,
        { style: styles.infoCell },
        h(Text, { style: styles.infoLabel }, 'Date'),
        h(Text, { style: styles.infoValue }, formatISTDate(signedAt))
      ),
      h(
        View,
        { style: styles.infoCell },
        h(Text, { style: styles.infoLabel }, 'Time'),
        h(Text, { style: styles.infoValue }, formatISTTime(signedAt))
      )
    ),
    h(
      View,
      { style: styles.infoRow },
      h(
        View,
        { style: styles.infoCell },
        h(Text, { style: styles.infoLabel }, 'Treating Doctor'),
        h(Text, { style: styles.infoValue }, 'Dr. Abhinav Kumar')
      ),
      h(
        View,
        { style: styles.infoCell },
        h(Text, { style: styles.infoLabel }, 'Staff Witness'),
        h(Text, { style: styles.infoValue }, staffWitness.full_name || 'N/A')
      )
    )
  )
}

function buildDynamicFields(template: ConsentTemplate, filledFields: ConsentPDFParams['filledFields']) {
  if (!template.dynamic_fields || template.dynamic_fields.length === 0) return null
  const rows: React.ReactElement[] = []
  for (let i = 0; i < template.dynamic_fields.length; i += 2) {
    const f1 = template.dynamic_fields[i]
    const f2 = template.dynamic_fields[i + 1]
    rows.push(
      h(
        View,
        { style: styles.tableRow, key: `row-${i}` },
        h(
          View,
          { style: styles.tableCell },
          h(Text, { style: styles.tableLabel }, f1.label),
          h(Text, { style: styles.tableValue }, renderValue(filledFields[f1.key]))
        ),
        f2
          ? h(
              View,
              { style: styles.tableCell },
              h(Text, { style: styles.tableLabel }, f2.label),
              h(Text, { style: styles.tableValue }, renderValue(filledFields[f2.key]))
            )
          : h(View, { style: styles.tableCell })
      )
    )
  }
  return h(
    View,
    { style: { marginBottom: 4 } },
    h(Text, { style: styles.dynamicTitle }, 'Treatment Specific Information'),
    h(View, { style: styles.table }, rows)
  )
}

function buildConsentSections(template: ConsentTemplate) {
  return template.sections.map((section, index) => {
    const isWarning = section.is_warning === true
    return h(
      View,
      { key: `section-${index}`, style: { marginBottom: 4 } },
      h(
        Text,
        { style: isWarning ? styles.sectionTitleWarning : styles.sectionTitle },
        `${index + 1}. ${section.title}`
      ),
      h(
        Text,
        { style: isWarning ? styles.sectionBodyWarning : styles.sectionBody },
        section.content
      )
    )
  })
}

const PATIENT_DECLARATION =
  'I confirm that I am above 18 years of age (or the guardian named below is legally authorised to consent on my behalf), am of sound mind, and have not been coerced or unduly influenced. I have read and understood this consent form in a language I comprehend, or it has been explained to me in full. I have had sufficient opportunity to ask questions and all my questions have been answered satisfactorily. I understand that I may withdraw consent before the procedure begins without affecting my right to appropriate medical care. I voluntarily consent to the procedure/treatment described in this form.'

function buildPatientDeclaration() {
  return h(
    View,
    { style: styles.declarationBox },
    h(Text, { style: styles.declarationTitle }, 'Patient Declaration'),
    h(Text, { style: styles.declarationText }, PATIENT_DECLARATION)
  )
}

function buildPhotoConsent(template: ConsentTemplate, photoConsent: boolean) {
  if (!template.has_photo_consent) return null
  const given = photoConsent
  return h(
    Text,
    {
      style: [
        styles.photoConsent,
        given ? styles.photoConsentGiven : styles.photoConsentDeclined,
      ],
    },
    `Clinical Photography: ${given ? '[✓] Consent Given' : '[✗] Consent Declined'}`
  )
}

function buildSignatures(
  signatureDataUrl: string,
  staffWitness: ConsentPDFParams['staffWitness'],
  signedAt: Date
) {
  return h(
    View,
    { style: styles.signaturesRow },
    // Patient signature
    h(
      View,
      { style: styles.signatureCol },
      h(
        View,
        { style: styles.signatureBoxLarge },
        h(Image, { src: signatureDataUrl, style: styles.signatureImage })
      ),
      h(
        Text,
        { style: styles.signatureLabel },
        'Patient / Guardian Signature'
      ),
      h(
        Text,
        { style: styles.signatureLabel },
        `${formatISTDate(signedAt)} ${formatISTTime(signedAt)}`
      )
    ),
    // Doctor signature
    h(
      View,
      { style: styles.signatureCol },
      h(View, { style: styles.signatureBox }, null),
      h(
        Text,
        { style: styles.signatureLabel },
        'Dr. Abhinav Kumar, MBBS MD (Dermatology)'
      ),
      h(
        Text,
        { style: styles.signatureLabel },
        'Reg. No.: MCI/Bihar Medical Council'
      )
    ),
    // Staff witness
    h(
      View,
      { style: styles.signatureCol },
      h(View, { style: styles.signatureBox }, null),
      h(
        Text,
        { style: styles.signatureLabel },
        `Staff Witness — ${staffWitness.full_name || 'N/A'}`
      )
    )
  )
}

function buildAuditFooter(
  signedAt: Date,
  deviceIp: string,
  staffWitness: ConsentPDFParams['staffWitness'],
  template: ConsentTemplate
) {
  const staffIdShort = staffWitness.id.replace(/-/g, '').toUpperCase().slice(0, 8)
  return h(
    View,
    { style: styles.auditFooter },
    h(
      Text,
      { style: styles.auditText },
      `Signed: ${formatISTDateTime(signedAt)} IST | Device IP: ${deviceIp} | Staff ID: ${staffIdShort} | Template: ${template.treatment_key} | The Skin Centre Consent Management | IT Act 2000 — Electronic Signature`
    )
  )
}

function ConsentDocument(params: ConsentPDFParams) {
  const { template, patient, filledFields, staffWitness, signatureDataUrl, deviceIp, signedAt, photoConsent, logoBase64 } =
    params

  return h(
    Document,
    null,
    h(
      Page,
      { size: 'A4', style: styles.page },
      // Header
      h(
        View,
        { style: styles.header },
        h(Image, { src: logoBase64, style: styles.logo }),
        h(
          View,
          { style: styles.headerText },
          h(Text, { style: styles.headerTitle }, 'THE SKIN CENTRE'),
          h(
            Text,
            { style: styles.headerSubtitle },
            'Dermatological Clinic, Kankarbagh, Patna, Bihar — 800020'
          ),
          h(
            Text,
            { style: styles.headerSubtitle },
            'www.theskincentre.in | theskincentre0@gmail.com'
          )
        )
      ),
      // Title
      h(Text, { style: styles.title }, template.name),
      h(Text, { style: styles.subtitle }, 'INFORMED CONSENT FORM'),
      // Patient info box
      buildInfoBox(patient, staffWitness, signedAt),
      // Dynamic fields
      buildDynamicFields(template, filledFields),
      // Consent sections
      ...buildConsentSections(template),
      // Photo consent
      buildPhotoConsent(template, photoConsent),
      // Patient declaration
      buildPatientDeclaration(),
      // Signatures
      buildSignatures(signatureDataUrl, staffWitness, signedAt),
      // Audit footer
      buildAuditFooter(signedAt, deviceIp, staffWitness, template),
      // Page footer
      h(
        View,
        { style: styles.pageFooter, fixed: true },
        h(
          Text,
          { style: styles.footerText },
          'The Skin Centre, Patna | Confidential Medical Record'
        ),
        h(
          Text,
          {
            style: styles.pageNumberText,
            render: ({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`,
          }
        )
      )
    )
  )
}

export async function generateConsentPDF(
  params: ConsentPDFParams
): Promise<{ pdfBytes: Uint8Array; hash: string }> {
  const stream = await renderToStream(h(ConsentDocument, params) as ReactElement)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const pdfBuffer = Buffer.concat(chunks)
  const pdfBytes = new Uint8Array(pdfBuffer)
  const hash = createHash('sha256').update(pdfBuffer).digest('hex')
  return { pdfBytes, hash }
}

export { calculateAge, formatISTDate, formatISTTime, formatISTDateTime, uhid }
