// Interview questions for a business profile. Each one feeds a specific part
// of a story built like the best local profiles: the customer's problem, the
// owner's story, what makes them different, how it works, what's included,
// who it's for, the standards they keep, and how to get started.

export interface InterviewQuestion {
  id: string;
  section: string;
  question: string;
  hint: string;
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  { id: 'owner', section: 'The people', question: 'Who owns the business, and what is each owner\'s role or title?', hint: 'Full names and titles, exactly how they want them shown. Example: Annie Bays, Founder and Licensed Psychologist.' },
  { id: 'problem', section: 'The problem', question: 'What is usually going on in a customer\'s life when they call you? What frustrates them about the other options?', hint: 'The situation before they find you. This becomes the opening of the story.' },
  { id: 'origin', section: 'The story', question: 'Why did you start the business? When and where did you open, and what were you doing before?', hint: 'Years, places, the moment the idea came together. Real dates only.' },
  { id: 'different', section: 'What makes it different', question: 'What do you do differently from everyone else in Sioux Falls who does what you do?', hint: 'Specific practices, not slogans. What would a customer notice?' },
  { id: 'how', section: 'How it works', question: 'Walk me through what working with you looks like, from the first call to the finished job.', hint: 'Step by step. Booking, the visit, follow up.' },
  { id: 'included', section: 'What is included', question: 'What is included, and what does it cost to get started? Share only prices you are comfortable publishing.', hint: 'Packages, starting prices, what is always included, what costs extra.' },
  { id: 'who', section: 'Who it is for', question: 'Who is your ideal customer, and who is it not a good fit for?', hint: 'Being honest about fit builds trust.' },
  { id: 'trust', section: 'Standards and trust', question: 'What standards do you hold yourself to? Licenses, insurance, guarantees, training, how you protect customers.', hint: 'Only what is true and current. License numbers are optional.' },
  { id: 'customer', section: 'A customer story', question: 'Tell me about a customer you helped that you are proud of. No names needed.', hint: 'The before, what you did, and the after.' },
  { id: 'quote1', section: 'In their words', question: 'Is there something you find yourself saying to customers all the time? A line that sums up how you work?', hint: 'Write it word for word. This is used as a quote.' },
  { id: 'quote2', section: 'In their words', question: 'What do you love most about doing this work in Sioux Falls?', hint: 'Word for word if possible. A second quote for the story.' },
  { id: 'local', section: 'Getting started', question: 'What parts of Sioux Falls and nearby towns do you serve? What are your hours, and how do people get started with you?', hint: 'Service area, hours, the best way to book.' },
  { id: 'next', section: 'What is next', question: 'What is coming next for the business?', hint: 'New services, expansion, anything customers should watch for.' },
  { id: 'photos', section: 'Photos', question: 'What photos can you send? The owners, the space or vehicles, work in progress, finished results.', hint: 'Upload them to the profile gallery. They appear inside the story.' },
];

export const interviewAsText = (businessName = 'your business') =>
  `Sioux Falls Go profile interview for ${businessName}\n\n` +
  INTERVIEW_QUESTIONS.map((q, i) => `${i + 1}. ${q.question}\n   (${q.hint})`).join('\n\n');
