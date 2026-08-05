import AsyncStorage from '@react-native-async-storage/async-storage';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function keyShown(userId: number | string) {
  return `review_prompt_last_shown_${userId}`;
}
function keyCompleted(userId: number | string) {
  return `review_prompt_completed_${userId}`;
}
function keyFirstDive(userId: number | string) {
  return `review_prompt_first_dive_${userId}`;
}

/**
 * Call after every successful dive save.
 * Returns true the first time the user saves a dive AND the prompt
 * hasn't been shown in the last 30 days AND the user hasn't already
 * completed a positive review.
 */
export async function shouldShowReviewPrompt(
  userId: number | string,
): Promise<boolean> {
  // Already completed a positive review — never show again
  const completed = await AsyncStorage.getItem(keyCompleted(userId));
  if (completed === 'true') return false;

  // Has the user logged a dive before?
  const firstDiveSaved = await AsyncStorage.getItem(keyFirstDive(userId));
  if (firstDiveSaved !== 'true') {
    // This IS their first dive — mark it and allow the prompt
    await AsyncStorage.setItem(keyFirstDive(userId), 'true');
    return true;
  }

  // Not their first dive — only show again after 30-day cooldown
  const lastShown = await AsyncStorage.getItem(keyShown(userId));
  if (!lastShown) return false; // shown before but no timestamp stored
  const elapsed = Date.now() - parseInt(lastShown, 10);
  return elapsed >= THIRTY_DAYS_MS;
}

/** Call when the modal is displayed so the cooldown timer starts. */
export async function recordReviewPromptShown(
  userId: number | string,
): Promise<void> {
  await AsyncStorage.setItem(keyShown(userId), String(Date.now()));
}

/** Call when the user gives 4–5 stars and taps "Rate on App Store". */
export async function recordReviewCompleted(
  userId: number | string,
): Promise<void> {
  await AsyncStorage.setItem(keyCompleted(userId), 'true');
}
