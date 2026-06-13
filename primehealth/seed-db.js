const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// 1. Read and parse .env.local
const envPath = path.join(__dirname, '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local file not found!')
  process.exit(1)
}

const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split(/\r?\n/).forEach((line) => {
  const parts = line.split('=')
  if (parts.length >= 2) {
    const key = parts[0].trim()
    const val = parts.slice(1).join('=').trim()
    if (key) env[key] = val
  }
})

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL']
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY']

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local!')
  process.exit(1)
}

// 2. Initialize Supabase Admin Client
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function runSeed() {
  console.log('🚀 Starting PrimeHealth Mock Database Seeding...')

  try {
    // 3. Create Admin Auth User directly without email confirmation
    const adminEmail = 'dr.abhinav@theskincentre.in'
    const adminPassword = 'admin12345'
    let adminUid = ''

    console.log(`\n🔑 Checking if auth user [${adminEmail}] exists...`)
    
    // Check if user already exists in auth
    const { data: userList, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) throw listError

    const existingUser = userList.users.find(u => u.email === adminEmail)

    if (existingUser) {
      console.log(`✅ Auth user already exists with ID: ${existingUser.id}`)
      adminUid = existingUser.id
    } else {
      console.log(`📝 Creating new auth user: ${adminEmail}`)
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true
      })
      if (createError) throw createError
      console.log(`✅ Auth user created successfully with ID: ${newUser.user.id}`)
      adminUid = newUser.user.id
    }

    // 4. Create/Sync profile
    console.log('\n👤 Syncing administrator profile in profiles table...')
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', adminUid)
      .maybeSingle()

    if (existingProfile) {
      console.log('✅ Administrator profile already exists!')
    } else {
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: adminUid,
        full_name: 'Dr. Abhinav Kumar',
        role: 'admin',
        phone: '+919999999999',
        is_active: true
      })
      if (profileErr) throw profileErr
      console.log('✅ Profile row created successfully!')
    }

    // 5. Seed Clinic Number forward lines
    console.log('\n📞 Seeding clinic Airtel phone numbers...')
    const { data: existingClinicNumbers } = await supabase.from('clinic_numbers').select('*')
    if (existingClinicNumbers && existingClinicNumbers.length > 0) {
      console.log('✅ Clinic numbers already seeded.')
    } else {
      const { error: clinicErr } = await supabase.from('clinic_numbers').insert([
        { phone_number: '+918000000001', service_name: 'Hair Care', display_name: 'Hair Treatment Helpline', is_active: true },
        { phone_number: '+918000000002', service_name: 'Skin Care', display_name: 'Skin Treatment Helpline', is_active: true },
        { phone_number: '+918000000003', service_name: 'General', display_name: 'General Enquiry', is_active: true }
      ])
      if (clinicErr) throw clinicErr
      console.log('✅ Mapped 3 Airtel clinic numbers.')
    }

    // 6. Seed default templates
    console.log('\n💬 Seeding default WhatsApp message templates...')
    const { data: existingTemplates } = await supabase.from('message_templates').select('*')
    if (existingTemplates && existingTemplates.length > 0) {
      console.log('✅ Message templates already seeded.')
    } else {
      const { error: templatesErr } = await supabase.from('message_templates').insert([
        {
          name: 'Missed Call Auto Reply',
          category: 'missed-call',
          message_text: 'Hi! 👋 We missed your call at *The Skin Centre*. \n\n🕐 *Office Hours:* 9 AM - 6 PM (Mon-Sat)\n🌐 *Website:* https://theskincentre.in\n\nWe will contact you shortly. Reply here if you need immediate assistance!'
        },
        {
          name: 'Follow Up',
          category: 'follow-up',
          message_text: 'Hi {{patient_name}}! This is The Skin Centre following up on your call. How can we help you today? 😊'
        },
        {
          name: 'Appointment Reminder',
          category: 'appointment-reminder',
          message_text: 'Hi {{patient_name}}! Reminder: You have an appointment at The Skin Centre tomorrow. See you soon! 🏥'
        }
      ])
      if (templatesErr) throw templatesErr
      console.log('✅ Logged 3 default message templates.')
    }

    // 7. Seed Patients
    console.log('\n👥 Seeding Patna patients database...')
    const { data: existingPatients } = await supabase.from('patients').select('*')
    let patientA, patientB, patientC

    if (existingPatients && existingPatients.length >= 3) {
      console.log('✅ Patients database already populated.')
      patientA = existingPatients[0]
      patientB = existingPatients[1]
      patientC = existingPatients[2]
    } else {
      const { data: seededPatients, error: patientErr } = await supabase.from('patients').insert([
        {
          full_name: 'Ayush Kumar',
          phone: '+919876543210',
          email: 'ayush@example.com',
          gender: 'male',
          date_of_birth: '2001-08-15',
          tags: ['Acne', 'Peel'],
          internal_notes: 'Highly sensitive skin, historically prone to redness. Preparing for a Chemical Peel treatment.'
        },
        {
          full_name: 'Nisha Kumari',
          phone: '+919988776655',
          email: 'nisha@example.com',
          gender: 'female',
          date_of_birth: '1995-03-24',
          tags: ['Laser', 'Hair Care'],
          internal_notes: 'Undergoing Laser Hair Reduction on forehead area.'
        },
        {
          full_name: 'Vikram Singh',
          phone: '+919933221100',
          email: 'vikram@example.com',
          gender: 'male',
          date_of_birth: '1988-12-05',
          tags: ['Botox'],
          internal_notes: 'Looking for a routine Botox consultation for frown lines.'
        }
      ]).select()

      if (patientErr) throw patientErr
      console.log('✅ Seeding completed for 3 active patients.')
      patientA = seededPatients[0]
      patientB = seededPatients[1]
      patientC = seededPatients[2]
    }

    // 8. Seed Call Logs & Missed Call recovery queue
    console.log('\n☎️ Seeding incoming Exotel calls & missed call queues...')
    const { data: existingCalls } = await supabase.from('calls').select('*')
    if (existingCalls && existingCalls.length > 0) {
      console.log('✅ Call logs already populated.')
    } else {
      // Create some call logs
      const callStartedA = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 mins ago
      const callStartedB = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hrs ago
      const callStartedC = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago

      const { data: insertedCalls, error: callsErr } = await supabase.from('calls').insert([
        {
          patient_phone: patientA.phone,
          patient_id: patientA.id,
          patient_name: patientA.full_name,
          exotel_call_sid: `ex_sid_${Date.now()}_A`,
          incoming_number: '+918000000002',
          service_type: 'Skin Care',
          call_status: 'missed',
          call_direction: 'inbound',
          call_started_at: callStartedA,
          call_duration: 0
        },
        {
          patient_phone: patientB.phone,
          patient_id: patientB.id,
          patient_name: patientB.full_name,
          exotel_call_sid: `ex_sid_${Date.now()}_B`,
          incoming_number: '+918000000001',
          service_type: 'Hair Care',
          call_status: 'answered',
          call_direction: 'inbound',
          call_started_at: callStartedB,
          call_duration: 142,
          staff_id: adminUid,
          staff_name: 'Dr. Abhinav Kumar'
        },
        {
          patient_phone: patientC.phone,
          patient_id: patientC.id,
          patient_name: patientC.full_name,
          exotel_call_sid: `ex_sid_${Date.now()}_C`,
          incoming_number: '+918000000003',
          service_type: 'General',
          call_status: 'missed',
          call_direction: 'inbound',
          call_started_at: callStartedC,
          call_duration: 0
        }
      ]).select()

      if (callsErr) throw callsErr
      console.log('✅ Seeding completed for 3 call logs.')

      // Sync missed calls table (in case DB trigger didn't run)
      console.log('🔄 Checking missed calls recovery table alignment...')
      const { data: existingMissed } = await supabase.from('missed_calls').select('*')
      if (!existingMissed || existingMissed.length === 0) {
        const missedA = insertedCalls.find(c => c.call_status === 'missed' && c.patient_phone === patientA.phone)
        const missedC = insertedCalls.find(c => c.call_status === 'missed' && c.patient_phone === patientC.phone)

        if (missedA && missedC) {
          const { error: missedErr } = await supabase.from('missed_calls').insert([
            {
              call_id: missedA.id,
              patient_id: patientA.id,
              patient_phone: patientA.phone,
              patient_name: patientA.full_name,
              incoming_number: missedA.incoming_number,
              service_type: missedA.service_type,
              missed_at: missedA.call_started_at,
              status: 'whatsapp_sent',
              whatsapp_sent_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
              whatsapp_message_id: 'wa_msg_mock_A'
            },
            {
              call_id: missedC.id,
              patient_id: patientC.id,
              patient_phone: patientC.phone,
              patient_name: patientC.full_name,
              incoming_number: missedC.incoming_number,
              service_type: missedC.service_type,
              missed_at: missedC.call_started_at,
              status: 'pending'
            }
          ])
          if (missedErr) throw missedErr
          console.log('✅ Seeding completed for 2 missed call queues.')
        }
      }
    }

    // 9. Seed WhatsApp chat conversations
    console.log('\n💬 Seeding WhatsApp two-way chat threads...')
    const { data: existingMessages } = await supabase.from('whatsapp_messages').select('*')
    if (existingMessages && existingMessages.length > 0) {
      console.log('✅ WhatsApp message threads already populated.')
    } else {
      const { data: activeMissedCalls } = await supabase.from('missed_calls').select('*').limit(2)
      const missedA = activeMissedCalls.find(mc => mc.patient_phone === patientA.phone)

      await supabase.from('whatsapp_messages').insert([
        {
          patient_id: patientA.id,
          patient_phone: patientA.phone,
          patient_name: patientA.full_name,
          whatsapp_message_id: 'wa_msg_mock_A_1',
          message_text: 'Hi! 👋 We missed your call at *The Skin Centre*. \n\n🕐 *Office Hours:* 9 AM - 6 PM (Mon-Sat)\n🌐 *Website:* https://theskincentre.in\n\nWe will contact you shortly. Reply here if you need immediate assistance!',
          direction: 'outbound',
          sent_by_automation: true,
          delivery_status: 'read',
          related_missed_call_id: missedA?.id || null,
          sent_at: new Date(Date.now() - 25 * 60 * 1000).toISOString()
        },
        {
          patient_id: patientA.id,
          patient_phone: patientA.phone,
          patient_name: patientA.full_name,
          whatsapp_message_id: 'wa_msg_mock_A_2',
          message_text: 'Hello, I wanted to ask if you have any slots available for a chemical peel this Thursday afternoon?',
          direction: 'inbound',
          delivery_status: 'read',
          related_missed_call_id: missedA?.id || null,
          sent_at: new Date(Date.now() - 20 * 60 * 1000).toISOString()
        },
        {
          patient_id: patientA.id,
          patient_phone: patientA.phone,
          patient_name: patientA.full_name,
          whatsapp_message_id: 'wa_msg_mock_A_3',
          message_text: 'Yes! We have a free slot at 3 PM and 4:30 PM this Thursday. Would you like me to book the 3 PM slot for you?',
          direction: 'outbound',
          sent_by_staff_id: adminUid,
          delivery_status: 'delivered',
          related_missed_call_id: missedA?.id || null,
          sent_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
        }
      ])

      // If we inserted message A_2 (inbound reply), update the missed call status to patient_replied
      if (missedA) {
        await supabase.from('missed_calls').update({
          status: 'patient_replied',
          patient_replied_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          patient_reply_text: 'Hello, I wanted to ask if you have any slots available for a chemical peel this Thursday afternoon?'
        }).eq('id', missedA.id)
      }

      console.log('✅ Two-way chats seeded for Ayush Kumar.')
    }

    console.log('\n✨ Database seeding completed successfully!')
    console.log('\n---------------------------------------------------------')
    console.log('   Use the following credentials to Log In:')
    console.log(`   📧 Email:     ${adminEmail}`)
    console.log(`   🔑 Password:  ${adminPassword}`)
    console.log('---------------------------------------------------------')

  } catch (err) {
    console.error('\n❌ Seeding script encountered an error:')
    console.error(err.message || err)
    process.exit(1)
  }
}

runSeed()
