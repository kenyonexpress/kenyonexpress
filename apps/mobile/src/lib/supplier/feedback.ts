import { FAIL_TONE_URI, SUCCESS_TONE_URI } from '@/lib/supplier/tones'
import { Audio } from 'expo-av'
import * as Haptics from 'expo-haptics'
import { Vibration } from 'react-native'

/**
 * The success / failure signal at the counter.
 *
 * THREE CHANNELS BECAUSE ANY ONE OF THEM CAN BE OFF. The phone may be on
 * silent, in a case that muffles the haptic, or held out at arm's length where
 * a vibration is felt by nobody. So: a tone, a haptic, and a vibration pattern,
 * and the screen turns green or red as well. Redundancy is the requirement, not
 * belt-and-braces caution.
 *
 * SOUNDS ARE LOADED ONCE AND KEPT. `createAsync` decodes the WAV every call,
 * which is 40-80 ms - long enough that a fast cashier gets the beep for scan N
 * while looking at scan N+1. They are unloaded on sign-out, not per scan.
 *
 * PLAYS EVEN ON SILENT, on iOS. A till that is mute because somebody flicked
 * the ringer switch is a till whose operator does not notice a refused voucher,
 * so `playsInSilentModeIOS` is set. This is a deliberate override of the user's
 * ringer setting and it is confined to the supplier mode.
 */

let successSound: Audio.Sound | null = null
let failSound: Audio.Sound | null = null
let configured = false

async function configureAudio(): Promise<void> {
  if (configured) return
  configured = true
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    staysActiveInBackground: false,
  }).catch(() => undefined)
}

async function load(): Promise<void> {
  await configureAudio()
  if (!successSound) {
    const created = await Audio.Sound.createAsync({ uri: SUCCESS_TONE_URI }).catch(() => null)
    successSound = created?.sound ?? null
  }
  if (!failSound) {
    const created = await Audio.Sound.createAsync({ uri: FAIL_TONE_URI }).catch(() => null)
    failSound = created?.sound ?? null
  }
}

/** Called when the scanner screen mounts, so the first scan is not the slow one. */
export async function warmUpFeedback(): Promise<void> {
  await load()
}

export async function releaseFeedback(): Promise<void> {
  await successSound?.unloadAsync().catch(() => undefined)
  await failSound?.unloadAsync().catch(() => undefined)
  successSound = null
  failSound = null
}

async function play(sound: Audio.Sound | null): Promise<void> {
  if (!sound) return
  // Rewind first: a second scan within the tone's length would otherwise be
  // silent, because the sound is already at its end.
  await sound.setPositionAsync(0).catch(() => undefined)
  await sound.playAsync().catch(() => undefined)
}

export async function signalSuccess(): Promise<void> {
  await load()
  await play(successSound)
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
  // One short pulse. Android only; iOS ignores the pattern and uses the haptic
  // above, which is why both are here rather than one being a fallback.
  Vibration.vibrate(60)
}

export async function signalFailure(): Promise<void> {
  await load()
  await play(failSound)
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined)
  // Two longer pulses. Distinguishable from success through a pocket, which is
  // the only channel left when the phone is face-down on the counter.
  Vibration.vibrate([0, 180, 90, 180])
}

/** Queued-while-offline: accepted, but not the same event as redeemed. */
export async function signalQueued(): Promise<void> {
  await load()
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
  Vibration.vibrate(30)
}
