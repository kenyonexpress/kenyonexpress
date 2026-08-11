import { type ScanResult, drainQueue, submitScan, verifyPin } from '@/lib/supplier/api'
import {
  releaseFeedback,
  signalFailure,
  signalQueued,
  signalSuccess,
  warmUpFeedback,
} from '@/lib/supplier/feedback'
import { pendingCount } from '@/lib/supplier/queue'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

/**
 * The till.
 *
 * THE SCANNER NEVER DECIDES. The camera reads a string; that string goes to the
 * server; the server's verdict is what the cashier is shown. The app does not
 * parse the QR, does not check its signature, and above all does not conclude
 * that anything succeeded because the code "looked right". Everything on screen
 * is either a server verdict or the honest statement that the scan is waiting.
 *
 * THE ONE-SHOT LOCK IS LOAD-BEARING. A camera fires the same code many times a
 * second while it stays in frame. Without `busy` a single voucher held steady
 * would produce dozens of requests; the database would collapse them (each is a
 * separate idempotency key, so they would be one success and N `already_redeemed`)
 * but the cashier would see the screen flip from green to red on its own.
 *
 * DRAINING RUNS ON MOUNT AND AFTER EVERY ONLINE SCAN. A till that has just
 * proved it has a connection is the right moment to flush what it queued while
 * it did not, and it costs the cashier nothing.
 */

type Verdict =
  | { tone: 'ok'; title: string; detail: string }
  | { tone: 'bad'; title: string; detail: string }
  | { tone: 'wait'; title: string; detail: string }

const SETTLE_MS = 2200

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [staff, setStaff] = useState<{ id: string; display_name: string } | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [pending, setPending] = useState(0)
  const [manual, setManual] = useState('')
  const busy = useRef(false)

  useEffect(() => {
    warmUpFeedback()
    pendingCount().then(setPending)
    drainQueue().then(() => pendingCount().then(setPending))
    return () => {
      releaseFeedback()
    }
  }, [])

  const applyResult = useCallback(async (result: ScanResult, fallbackLabel: string) => {
    if (result.kind === 'queued') {
      await signalQueued()
      setPending(result.pending)
      setVerdict({
        tone: 'wait',
        title: 'נשמר לסנכרון',
        // Said plainly. The cashier must not read this as "redeemed".
        detail: 'אין רשת. השובר טרם מומש, והסריקה תישלח כשהחיבור יחזור.',
      })
      return
    }

    if (result.outcome === 'success' && !result.replayed) {
      await signalSuccess()
      setVerdict({ tone: 'ok', title: 'מומש', detail: result.code ?? fallbackLabel })
      // A scan that reached the server proves the connection; flush anything
      // that was queued before it.
      drainQueue().then(() => pendingCount().then(setPending))
      return
    }

    await signalFailure()
    setVerdict({
      tone: 'bad',
      title: result.replayed ? 'כבר מומש' : result.message,
      detail: result.code ?? fallbackLabel,
    })
  }, [])

  const handleScan = useCallback(
    async (raw: string) => {
      if (busy.current || !staff) return
      busy.current = true
      setVerdict(null)

      const value = raw.trim()
      // The payload format decides which field it goes in, and that is the only
      // interpretation the app makes: a signed QR carries a dot-separated
      // payload, a keyed-in code does not.
      const isQr = value.includes('.') || value.length > 24

      const result = await submitScan({
        qrPayload: isQr ? value : undefined,
        code: isQr ? undefined : value,
        scanMethod: 'camera',
        // Empty when the cashier chose to skip the PIN. Sent as undefined, not
        // as '', because the server validates it as a uuid and would reject the
        // whole scan over a field that only names a person.
        staffId: staff.id || undefined,
        label: value.slice(0, 12),
      })
      await applyResult(result, value.slice(0, 12))

      setTimeout(() => {
        busy.current = false
      }, SETTLE_MS)
    },
    [staff, applyResult],
  )

  async function handleManual() {
    const value = manual.trim()
    if (!value || !staff || busy.current) return
    busy.current = true
    setManual('')
    const result = await submitScan({
      code: value,
      scanMethod: 'manual',
      staffId: staff.id || undefined,
      label: value,
    })
    await applyResult(result, value)
    busy.current = false
  }

  async function submitPin() {
    setPinBusy(true)
    setPinError(null)
    const result = await verifyPin(pin)
    setPinBusy(false)
    setPin('')
    if (result.ok) {
      setStaff(result.staff)
      return
    }
    setPinError(
      result.reason === 'locked'
        ? 'הקוד ננעל זמנית. פנו למנהל.'
        : result.reason === 'offline'
          ? 'אין רשת. אי אפשר לזהות עובד כרגע.'
          : 'קוד שגוי.',
    )
  }

  if (!staff) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>מי בעמדה?</Text>
        <Text style={styles.body}>הזינו את קוד העובד כדי שהסריקות יירשמו על שמכם.</Text>
        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          placeholder="קוד עובד"
        />
        {pinError ? <Text style={styles.error}>{pinError}</Text> : null}
        <Pressable
          style={[styles.buttonPrimary, pinBusy && styles.busy]}
          disabled={pin.length < 4 || pinBusy}
          onPress={submitPin}
        >
          <Text style={styles.buttonPrimaryText}>כניסה</Text>
        </Pressable>
        {/*
          Skipping is allowed on purpose. A PIN is attribution, not permission,
          and refusing to open the till because nobody set up staff yet would
          stop a business selling.
        */}
        <Pressable
          style={styles.link}
          onPress={() => setStaff({ id: '', display_name: 'ללא שם' })}
        >
          <Text style={styles.linkText}>המשך בלי קוד עובד</Text>
        </Pressable>
      </View>
    )
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>נדרשת גישה למצלמה</Text>
        <Text style={styles.body}>בלי המצלמה אפשר עדיין להקליד את קוד השובר ידנית.</Text>
        <Pressable style={styles.buttonPrimary} onPress={() => requestPermission()}>
          <Text style={styles.buttonPrimaryText}>אישור גישה</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={styles.fill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          handleScan(data)
        }}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.staffChip}>
          <Text style={styles.staffChipText}>
            {staff.display_name}
            {pending > 0 ? ` · ${pending} ממתינות` : ''}
          </Text>
        </View>

        {verdict ? (
          <View
            style={[
              styles.verdict,
              verdict.tone === 'ok'
                ? styles.verdictOk
                : verdict.tone === 'bad'
                  ? styles.verdictBad
                  : styles.verdictWait,
            ]}
          >
            <Text style={styles.verdictTitle}>{verdict.title}</Text>
            <Text style={styles.verdictDetail}>{verdict.detail}</Text>
          </View>
        ) : null}

        <View style={styles.manualBar}>
          <TextInput
            style={styles.manualInput}
            value={manual}
            onChangeText={setManual}
            placeholder="הקלדת קוד ידנית"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
          />
          <Pressable style={styles.manualButton} onPress={handleManual}>
            <Text style={styles.manualButtonText}>מימוש</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', writingDirection: 'rtl' },
  body: {
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 24,
    writingDirection: 'rtl',
  },
  error: { fontSize: 14, color: '#b91c1c', textAlign: 'center', writingDirection: 'rtl' },
  pinInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 26,
    letterSpacing: 8,
    textAlign: 'center',
    minWidth: 200,
  },
  buttonPrimary: {
    backgroundColor: '#f5c518',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  buttonPrimaryText: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  busy: { opacity: 0.6 },
  link: { paddingVertical: 10 },
  linkText: { fontSize: 14, color: '#4b5563' },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', padding: 16 },
  staffChip: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  staffChipText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },

  verdict: { borderRadius: 16, padding: 22, alignItems: 'center', gap: 6 },
  verdictOk: { backgroundColor: 'rgba(22,163,74,0.92)' },
  verdictBad: { backgroundColor: 'rgba(185,28,28,0.92)' },
  verdictWait: { backgroundColor: 'rgba(180,83,9,0.92)' },
  verdictTitle: { color: '#ffffff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  verdictDetail: { color: '#ffffff', fontSize: 15, textAlign: 'center', writingDirection: 'rtl' },

  manualBar: { flexDirection: 'row', gap: 8 },
  manualInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: 'right',
  },
  manualButton: {
    backgroundColor: '#f5c518',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  manualButtonText: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
})
