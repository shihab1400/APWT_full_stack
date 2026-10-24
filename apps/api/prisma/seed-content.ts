// Starter public content. Demo doctors are fictional and exist only for local development.

export const hotlines = [
  {
    name: 'National Emergency Service',
    number: '999',
    description: 'Police, fire and ambulance. Call if you or someone else is in immediate danger.',
    availability: '24/7, free',
  },
];

export const faqs: { category: string; question: string; answer: string }[] = [
  {
    category: 'General',
    question: 'What is MindEase Oasis?',
    answer:
      'MindEase Oasis is a mental-health support platform. You can talk to an AI companion, take a short self-assessment, read wellbeing resources, and book verified mental-health professionals.',
  },
  {
    category: 'General',
    question: 'Is MindEase Oasis a replacement for therapy or emergency care?',
    answer:
      'No. The AI companion offers emotional support and general guidance, but it cannot diagnose or treat. If you are in danger or thinking about harming yourself, call 999 or go to the nearest hospital.',
  },
  {
    category: 'General',
    question: 'Do I need an account to use the site?',
    answer:
      'No account is needed to read articles, view FAQs, see emergency hotlines, browse doctors, or contact support. You need a free account for the AI companion and self-assessment.',
  },
  {
    category: 'AI Companion',
    question: 'How many messages can I send on the free plan?',
    answer:
      'Free accounts can send a limited number of AI messages each day. Premium removes the limit.',
  },
  {
    category: 'AI Companion',
    question: 'What happens if I mention something serious in the chat?',
    answer:
      'If the conversation suggests you may be at risk, the companion shows emergency contacts straight away and encourages you to reach a professional. You are never left with only an automated reply.',
  },
  {
    category: 'Appointments & Payments',
    question: 'How do consultations work?',
    answer:
      'Premium users can book a verified doctor for an online consultation, held as a private text chat, or an in-person visit. The doctor accepts or declines the request, and you get a reminder before the session.',
  },
  {
    category: 'Appointments & Payments',
    question: 'How much does a consultation cost?',
    answer:
      "Each doctor sets their own fee, shown on their profile and on the pricing page. You are never charged more than the doctor's listed fee.",
  },
  {
    category: 'Appointments & Payments',
    question: 'What if a payment fails?',
    answer:
      'If a payment does not complete, the booking is not created and no money is taken. You can safely try again.',
  },
  {
    category: 'Privacy & Safety',
    question: 'Who can see my conversations and results?',
    answer:
      "Your AI chats and assessment results are private to you. A doctor can only see the details you share for an appointment you've booked with them. Data is encrypted in transit and sensitive fields are encrypted at rest.",
  },
  {
    category: 'Privacy & Safety',
    question: 'How are doctors verified?',
    answer:
      'Doctors submit their qualifications and licence. An admin reviews them, and the profile only becomes visible after approval.',
  },
];

export const demoDoctors = [
  {
    email: 'sarah.ahmed@demo.mindease.local',
    name: 'Dr. Sarah Ahmed',
    specialization: 'Psychiatrist',
    qualifications: 'MBBS, FCPS (Psychiatry)',
    experienceYears: 9,
    fee: 1000,
    bio: 'Works with adults experiencing anxiety, depression and sleep problems, combining medication review with practical coping plans.',
  },
  {
    email: 'tanvir.hasan@demo.mindease.local',
    name: 'Dr. Tanvir Hasan',
    specialization: 'Clinical Psychologist',
    qualifications: 'MPhil (Clinical Psychology)',
    experienceYears: 6,
    fee: 800,
    bio: 'Uses cognitive behavioural therapy to help with stress, panic, and low mood. Comfortable working in Bangla and English.',
  },
  {
    email: 'nusrat.jahan@demo.mindease.local',
    name: 'Dr. Nusrat Jahan',
    specialization: 'Counselling Psychologist',
    qualifications: 'MS (Counselling Psychology)',
    experienceYears: 4,
    fee: 600,
    bio: 'Supports students and young professionals with academic pressure, relationships, and self-esteem.',
  },
];

export const blogPosts = [
  {
    slug: 'managing-anxiety-small-steps',
    title: 'Managing Anxiety: Small Steps That Help',
    category: 'Anxiety',
    excerpt:
      'Anxiety is a normal response to stress, but it can become overwhelming. Here are practical steps you can try today.',
    body: `Anxiety is the body's natural alarm system. It helps us notice danger and prepare to act. When the alarm goes off too often, or too loudly, it can get in the way of everyday life.

## Notice what anxiety feels like for you

Anxiety shows up differently for everyone. Common signs include:

- A racing heart or tight chest
- Restless thoughts that are hard to switch off
- Trouble sleeping or concentrating
- Avoiding places or people that feel stressful

Naming what you notice ("my chest feels tight, my thoughts are racing") can make the feeling a little less overwhelming.

## Slow your breathing

Try breathing in gently through your nose for four counts, holding for a moment, and breathing out slowly for six counts. A longer out-breath tells your body it is safe to settle. Repeat for two or three minutes.

## Ground yourself in the present

When worries pull you into the future, bring your attention back to now. Look around and name five things you can see, four you can touch, three you can hear, two you can smell and one you can taste.

## Keep a steady routine

Regular sleep, meals and some daily movement, even a short walk, give your nervous system a stable base. Cutting back on caffeine can also help.

## When to reach out

If anxiety is affecting your work, studies, relationships or sleep for more than a couple of weeks, talking to a professional can help a lot. You don't have to wait until things feel unbearable.`,
  },
  {
    slug: 'sleep-and-mood',
    title: 'How Sleep Affects Your Mood',
    category: 'Wellbeing',
    excerpt:
      'Poor sleep and low mood often feed each other. Small changes to your evening can make a real difference.',
    body: `Sleep and mental health are closely linked. A few bad nights can make us more irritable, anxious and less able to cope, and stress can in turn make it harder to sleep.

## Build a wind-down routine

Give yourself 30 to 60 minutes before bed to slow down. Dim the lights, put your phone away, and do something calm such as reading, stretching or listening to quiet music.

## Keep regular hours

Going to bed and waking up at roughly the same time every day, including weekends, helps your body clock settle.

## Watch out for sleep stealers

- Caffeine in the afternoon or evening
- Heavy meals late at night
- Scrolling in bed
- Long daytime naps

## If you can't sleep

If you have been lying awake for a long time, get up and do something quiet in dim light until you feel sleepy, then return to bed. Lying in bed worrying about sleep tends to make it harder.

If sleep problems continue for several weeks, or you feel low most days, consider speaking to a doctor.`,
  },
  {
    slug: 'talking-to-someone-you-trust',
    title: 'Talking to Someone You Trust',
    category: 'Relationships',
    excerpt:
      'Opening up can feel hard, but sharing what you are going through is often the first step to feeling better.',
    body: `Many of us keep our struggles to ourselves because we don't want to be a burden, or we worry about how others will react. Yet talking is one of the most effective ways to lighten the load.

## Choose the right person

Think of someone who listens without judging: a friend, family member, teacher or colleague. It doesn't have to be the person you are closest to, just someone you feel safe with.

## Pick a good moment

Find a quiet time when neither of you is rushed. You might start with something simple like "Can I talk to you about something that's been on my mind?"

## You don't need the perfect words

It's okay to say "I'm not sure how to explain this" or "I've just been feeling off lately." The other person doesn't need to fix anything. Being heard is often enough.

## If talking feels too hard

Writing your thoughts down first, or sending a message, can make it easier to start. A trained professional is also always an option if you'd rather talk to someone outside your circle.`,
  },
  {
    slug: 'when-to-seek-professional-help',
    title: 'When to Seek Professional Help',
    category: 'Getting Help',
    excerpt:
      'Everyone has hard days. Here are some signs that it may be time to talk to a mental-health professional.',
    body: `Feeling sad, stressed or worried from time to time is part of life. But sometimes these feelings stay, grow stronger, or start to affect how we live. That is a good time to reach out for professional support.

## Signs it may be time

- Low mood, worry or irritability on most days for two weeks or more
- Losing interest in things you used to enjoy
- Changes in sleep or appetite
- Finding it hard to manage work, study or relationships
- Using alcohol or other substances to cope
- Feeling hopeless or thinking that life isn't worth living

## What a professional can offer

Psychiatrists, psychologists and counsellors can help you understand what is happening, learn practical coping skills, and, where needed, discuss treatment options. Seeking help is a sign of strength, not weakness.

## If you are in crisis

If you are thinking about harming yourself or feel unable to stay safe, call 999 or go to the nearest hospital emergency department now. You deserve support straight away.`,
  },
];
