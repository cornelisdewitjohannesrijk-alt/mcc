/**
 * Demo seed — creates realistic conversations with messages so the inbox
 * looks populated during browser testing. Run once after the main seed.
 *
 *   DATABASE_URL="..." npx tsx prisma/seed-demo.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_CUSTOMERS = [
  {
    name: 'Maria Santos',
    whatsappPhone: '+5511999991111',
    platform: 'whatsapp' as const,
    messages: [
      { direction: 'inbound' as const, text: 'Olá! Gostaria de saber sobre os preços.' },
      { direction: 'outbound' as const, text: 'Olá Maria! Claro, qual produto te interessa?' },
      { direction: 'inbound' as const, text: 'O plano mensal. Vocês têm desconto para pagamento anual?' },
      { direction: 'outbound' as const, text: 'Sim! No plano anual você tem 20% de desconto. Posso te enviar os detalhes.' },
      { direction: 'inbound' as const, text: 'Por favor! Muito obrigada 😊' },
    ],
    unread: 1,
  },
  {
    name: 'John Carter',
    whatsappPhone: '+14155552222',
    platform: 'whatsapp' as const,
    messages: [
      { direction: 'inbound' as const, text: 'Hi, I placed an order yesterday but haven\'t received a confirmation email.' },
      { direction: 'outbound' as const, text: 'Hi John! Let me check that for you. Can you share your order number?' },
      { direction: 'inbound' as const, text: 'It\'s #ORD-2024-8821' },
      { direction: 'inbound' as const, text: 'Also, when is the expected delivery?' },
    ],
    unread: 2,
  },
  {
    name: 'Sophie Dubois',
    messengerPsid: 'psid_sophie_123456',
    platform: 'messenger' as const,
    messages: [
      { direction: 'inbound' as const, text: 'Bonjour! Je voudrais retourner un article.' },
      { direction: 'outbound' as const, text: 'Bonjour Sophie! Bien sûr, quel article souhaitez-vous retourner?' },
      { direction: 'inbound' as const, text: 'La veste rouge que j\'ai commandée la semaine dernière. Elle est trop grande.' },
      { direction: 'outbound' as const, text: 'Pas de problème! Je vais vous envoyer l\'étiquette de retour.' },
    ],
    unread: 0,
  },
  {
    name: 'Ahmed Al-Rashid',
    messengerPsid: 'psid_ahmed_789012',
    platform: 'messenger' as const,
    messages: [
      { direction: 'inbound' as const, text: 'Hello, do you ship internationally?' },
      { direction: 'outbound' as const, text: 'Yes, we ship to over 50 countries! Where are you located?' },
      { direction: 'inbound' as const, text: 'Dubai, UAE.' },
      { direction: 'outbound' as const, text: 'Great! We ship to UAE. Delivery takes 5-7 business days. Shipping is free on orders over $100.' },
      { direction: 'inbound' as const, text: 'Perfect! I\'ll place my order now. Thank you!' },
      { direction: 'outbound' as const, text: 'Wonderful! Feel free to reach out if you need anything else 😊' },
    ],
    unread: 0,
  },
  {
    name: 'Camila Torres',
    whatsappPhone: '+5491155553333',
    platform: 'whatsapp' as const,
    messages: [
      { direction: 'inbound' as const, text: 'Buenos días! Tienen disponibilidad para este fin de semana?' },
    ],
    unread: 1,
  },
]

async function main() {
  console.log('Seeding demo conversations...')

  const now = new Date()

  for (let i = 0; i < DEMO_CUSTOMERS.length; i++) {
    const demo = DEMO_CUSTOMERS[i]

    // Create customer
    const customer = await prisma.customer.upsert({
      where: demo.platform === 'whatsapp'
        ? { whatsappPhone: demo.whatsappPhone }
        : { messengerPsid: demo.messengerPsid },
      update: {},
      create: {
        name: demo.name,
        whatsappPhone: demo.whatsappPhone ?? null,
        messengerPsid: demo.messengerPsid ?? null,
        firstContactAt: new Date(now.getTime() - (DEMO_CUSTOMERS.length - i) * 24 * 60 * 60 * 1000),
        lastMessageAt: new Date(now.getTime() - i * 15 * 60 * 1000),
      },
    })

    // Create conversation
    const lastMsg = demo.messages[demo.messages.length - 1]
    const conversation = await prisma.conversation.upsert({
      where: { customerId_platform: { customerId: customer.id, platform: demo.platform } },
      update: {},
      create: {
        customerId: customer.id,
        platform: demo.platform,
        status: 'open',
        unreadCount: demo.unread,
        lastMessageAt: new Date(now.getTime() - i * 15 * 60 * 1000),
        lastMessagePreview: lastMsg.text?.slice(0, 100) ?? '',
        lastCustomerMessageAt: new Date(now.getTime() - i * 15 * 60 * 1000 - 60000),
      },
    })

    // Create messages
    for (let j = 0; j < demo.messages.length; j++) {
      const msg = demo.messages[j]
      const msgTime = new Date(
        now.getTime() - i * 15 * 60 * 1000 - (demo.messages.length - j) * 3 * 60 * 1000
      )

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: msg.direction,
          contentType: 'text',
          text: msg.text,
          status: msg.direction === 'outbound' ? 'read' : null,
          timestamp: msgTime,
        },
      })
    }

    console.log(`  ✓ ${demo.name} (${demo.platform}) — ${demo.messages.length} messages`)
  }

  console.log('Demo seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
