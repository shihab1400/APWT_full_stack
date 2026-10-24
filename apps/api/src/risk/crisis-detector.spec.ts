import { detectCrisis } from './crisis-detector.js';

describe('detectCrisis', () => {
  it.each([
    'I keep thinking about suicide',
    'I feel suicidal tonight',
    'I want to kill myself',
    'sometimes I think about ending my life',
    'I just want to die',
    'everyone would be better off dead without me... I mean I would be better off dead',
    "I don't want to live anymore",
    'I have been self-harming again',
    'I cut myself last night',
    "I can't go on like this",
    'ami more jete chai',
    'আমি আত্মহত্যা করতে চাই',
    'আমি আর বাঁচতে চাই না',
  ])('flags "%s"', (text) => {
    expect(detectCrisis(text).flagged).toBe(true);
  });

  it.each([
    'I am feeling stressed about my exams',
    'My phone battery is going to die',
    'I had a killer workday',
    'How can I sleep better?',
    'I feel lonely since I moved cities',
  ])('does not flag "%s"', (text) => {
    expect(detectCrisis(text).flagged).toBe(false);
  });
});
