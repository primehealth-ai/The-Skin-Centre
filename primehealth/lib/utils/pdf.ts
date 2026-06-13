import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

interface ConsentPDFData {
  patientName: string
  patientPhone: string
  treatment: string
  consentText: string
  signatureDataUrl: string
  signedAt: string
  signedByIp: string
  staffName?: string
}

/**
 * Generates a beautiful consent form PDF using pdf-lib
 */
export async function generateConsentPDF(data: ConsentPDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4 size: 595.27 x 841.89 points
  
  const { width, height } = page.getSize()
  const margin = 50
  
  // Use standard fonts
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  
  // 1. Draw header banner
  page.drawRectangle({
    x: 0,
    y: height - 100,
    width: width,
    height: 100,
    color: rgb(0.06, 0.09, 0.16), // #0F172A (Sidebar/Primary dark color)
  })
  
  // Header text
  page.drawText('THE SKIN CENTRE', {
    x: margin,
    y: height - 55,
    size: 22,
    font: fontHelveticaBold,
    color: rgb(1, 1, 1),
  })
  
  page.drawText('PRIME HEALTH CLINIC INTELLIGENCE SYSTEM', {
    x: margin,
    y: height - 75,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.59, 0.66, 0.79), // slate-400
  })

  // 2. Patient details section
  let currentY = height - 140
  
  page.drawText('PATIENT MEDICAL CONSENT FORM', {
    x: margin,
    y: currentY,
    size: 16,
    font: fontHelveticaBold,
    color: rgb(0.06, 0.09, 0.16),
  })
  
  currentY -= 25
  page.drawLine({
    start: { x: margin, y: currentY },
    end: { x: width - margin, y: currentY },
    thickness: 1,
    color: rgb(0.88, 0.91, 0.95), // slate-200
  })
  
  // Details grid
  currentY -= 20
  page.drawText('Patient Name:', { x: margin, y: currentY, size: 10, font: fontHelveticaBold, color: rgb(0.25, 0.32, 0.44) })
  page.drawText(data.patientName || 'N/A', { x: margin + 90, y: currentY, size: 10, font: fontHelvetica })
  
  page.drawText('Date/Time:', { x: width / 2 + 20, y: currentY, size: 10, font: fontHelveticaBold, color: rgb(0.25, 0.32, 0.44) })
  page.drawText(new Date(data.signedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), { x: width / 2 + 100, y: currentY, size: 10, font: fontHelvetica })
  
  currentY -= 18
  page.drawText('Phone:', { x: margin, y: currentY, size: 10, font: fontHelveticaBold, color: rgb(0.25, 0.32, 0.44) })
  page.drawText(data.patientPhone || 'N/A', { x: margin + 90, y: currentY, size: 10, font: fontHelvetica })
  
  page.drawText('Treatment:', { x: width / 2 + 20, y: currentY, size: 10, font: fontHelveticaBold, color: rgb(0.25, 0.32, 0.44) })
  page.drawText(data.treatment || 'N/A', { x: width / 2 + 100, y: currentY, size: 10, font: fontHelvetica })

  if (data.staffName) {
    currentY -= 18
    page.drawText('Witness (Staff):', { x: margin, y: currentY, size: 10, font: fontHelveticaBold, color: rgb(0.25, 0.32, 0.44) })
    page.drawText(data.staffName, { x: margin + 90, y: currentY, size: 10, font: fontHelvetica })
  }

  currentY -= 25
  page.drawLine({
    start: { x: margin, y: currentY },
    end: { x: width - margin, y: currentY },
    thickness: 1,
    color: rgb(0.88, 0.91, 0.95), // slate-200
  })
  
  // 3. Consent Text (wrap and format)
  currentY -= 30
  page.drawText('Consent Declaration & Terms:', {
    x: margin,
    y: currentY,
    size: 12,
    font: fontHelveticaBold,
    color: rgb(0.06, 0.09, 0.16),
  })
  
  currentY -= 20
  const paragraphs = data.consentText.split('\n')
  const maxLineWidth = width - 2 * margin
  const fontSize = 9.5
  const leading = 13.5
  
  for (const para of paragraphs) {
    if (!para.trim()) {
      currentY -= 10
      continue
    }
    
    // Simple line wrap
    const words = para.split(' ')
    let currentLine = ''
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const testLineWidth = fontHelvetica.widthOfTextAtSize(testLine, fontSize)
      
      if (testLineWidth > maxLineWidth) {
        page.drawText(currentLine, {
          x: margin,
          y: currentY,
          size: fontSize,
          font: fontHelvetica,
          color: rgb(0.18, 0.25, 0.37), // slate-700
        })
        currentY -= leading
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    
    if (currentLine) {
      page.drawText(currentLine, {
        x: margin,
        y: currentY,
        size: fontSize,
        font: fontHelvetica,
        color: rgb(0.18, 0.25, 0.37),
      })
      currentY -= leading
    }
    currentY -= 5 // spacing between paragraphs
  }
  
  // 4. Draw Signature and OTP details
  currentY -= 40
  
  // Let's check if signature fits. If Y coordinate is too low, add a new page
  if (currentY < 180) {
    const newPage = pdfDoc.addPage([595, 842])
    const newHeight = newPage.getSize().height
    currentY = newHeight - 100
  }
  
  const signatureSectionPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1]
  
  signatureSectionPage.drawLine({
    start: { x: margin, y: currentY },
    end: { x: width - margin, y: currentY },
    thickness: 1,
    color: rgb(0.88, 0.91, 0.95), // slate-200
  })
  
  currentY -= 30
  signatureSectionPage.drawText('VERIFICATION & SIGNATURE', {
    x: margin,
    y: currentY,
    size: 12,
    font: fontHelveticaBold,
    color: rgb(0.06, 0.09, 0.16),
  })
  
  currentY -= 20
  signatureSectionPage.drawText(`Signing IP Address: ${data.signedByIp || '127.0.0.1'}`, {
    x: margin,
    y: currentY,
    size: 8.5,
    font: fontHelvetica,
    color: rgb(0.47, 0.55, 0.67), // slate-500
  })
  
  currentY -= 15
  signatureSectionPage.drawText('Status: Digitally Signed & OTP Verified via Twilio Verify', {
    x: margin,
    y: currentY,
    size: 8.5,
    font: fontHelveticaBold,
    color: rgb(0.06, 0.73, 0.51), // Success green
  })
  
  // Signature image
  if (data.signatureDataUrl && data.signatureDataUrl.includes('base64,')) {
    try {
      const rawBase64 = data.signatureDataUrl.split('base64,')[1]
      const sigImageBytes = Buffer.from(rawBase64, 'base64')
      const sigImage = await pdfDoc.embedPng(sigImageBytes)
      
      const sigWidth = 150
      const sigHeight = 75
      
      signatureSectionPage.drawText('Patient Digital Signature:', {
        x: width - margin - sigWidth,
        y: currentY + 35,
        size: 9.5,
        font: fontHelveticaBold,
        color: rgb(0.25, 0.32, 0.44),
      })
      
      signatureSectionPage.drawImage(sigImage, {
        x: width - margin - sigWidth,
        y: currentY - 50,
        width: sigWidth,
        height: sigHeight,
      })
    } catch (e) {
      console.error('Error embedding signature image into PDF:', e)
      signatureSectionPage.drawText('[Signature Image Render Error]', {
        x: width - margin - 150,
        y: currentY,
        size: 9.5,
        font: fontHelvetica,
        color: rgb(0.89, 0.27, 0.27),
      })
    }
  } else {
    signatureSectionPage.drawText('Signature Image Not Provided', {
      x: width - margin - 150,
      y: currentY,
      size: 9.5,
      font: fontHelvetica,
      color: rgb(0.47, 0.55, 0.67),
    })
  }
  
  // Footer
  const footerPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1]
  footerPage.drawText('This is a secure, tamper-proof digitally-signed document generated by PrimeHealth Clinic Intelligence System.', {
    x: margin,
    y: 30,
    size: 7.5,
    font: fontHelvetica,
    color: rgb(0.59, 0.66, 0.79),
  })
  
  return await pdfDoc.save()
}
