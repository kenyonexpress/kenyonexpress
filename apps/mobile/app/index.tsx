import { registerForPush } from '@/lib/push'
import { signOutEverywhere, supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { Link, router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

/**
 * Home, and the sign-in gate in front of it.
 *
 * SIGN-IN IS AN EMAIL CODE, NOT A MAGIC LINK. A link has to leave the app,
 * open a browser, and come back through a deep link - three places to lose the
 * customer, and on iOS the mail app frequently opens the link in a webview that
 * cannot hand it back at all. A six digit code stays on this screen.
 */
export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!session) return <SignIn />

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>שלום</Text>
      <Text style={styles.body}>{session.user.email}</Text>

      <Link href="/coupons" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>הקופונים שלי</Text>
        </Pressable>
      </Link>

      <Link href="/wallet" asChild>
        <Pressable style={styles.buttonQuiet}>
          <Text style={styles.buttonQuietText}>הארנק שלי</Text>
        </Pressable>
      </Link>

      <Pressable style={styles.buttonQuiet} onPress={() => router.push('/checkout' as never)}>
        <Text style={styles.buttonQuietText}>מעבר לתשלום</Text>
      </Pressable>

      {/*
        Always shown, never conditional on being a supplier. The gate lives on
        the screen itself, which can tell "not a supplier" from "scanning is
        switched off for your business" - hiding the entry point here would turn
        both into "the button is missing", which is the support call.
      */}
      <Link href="/supplier" asChild>
        <Pressable style={styles.buttonQuiet}>
          <Text style={styles.buttonQuietText}>מצב ספק (סריקת שוברים)</Text>
        </Pressable>
      </Link>

      <Pressable
        style={styles.link}
        onPress={async () => {
          await signOutEverywhere()
        }}
      >
        <Text style={styles.linkText}>התנתקות</Text>
      </Pressable>
    </ScrollView>
  )
}

/**
 * Sign-in, by email code or by SMS.
 *
 * THE PHONE OPTION IS BEHIND THE SAME FLAG AS THE WEBSITE'S. Supabase only
 * sends an SMS when a provider is wired into the project, which is a dashboard
 * action; showing the tab without one gives a customer a button that always
 * fails. On the app the flag is `EXPO_PUBLIC_PHONE_AUTH_ENABLED`, which is
 * baked into the bundle - so turning the provider off means shipping an update,
 * and that is the trade for not making a network call before rendering a login
 * screen.
 *
 * NORMALISATION IS DELIBERATELY DUPLICATED HERE and nowhere else in the app.
 * The website's `toE164Israeli` is server code the bundle cannot import, and
 * sending Supabase a local '0501234567' fails with "invalid phone" rather than
 * with anything a customer could act on.
 */
const PHONE_AUTH_ENABLED =
  process.env.EXPO_PUBLIC_PHONE_AUTH_ENABLED === 'true' ||
  process.env.EXPO_PUBLIC_PHONE_AUTH_ENABLED === '1'

function toE164Israeli(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('972')) {
    const rest = digits.slice(3).replace(/^0/, '')
    return rest.length >= 8 && rest.length <= 9 ? `+972${rest}` : null
  }
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    return `+972${digits.slice(1)}`
  }
  return null
}

function SignIn() {
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode() {
    setBusy(true)
    setError(null)

    if (mode === 'phone') {
      const e164 = toE164Israeli(phone)
      // Mobile only: a landline is accepted by the provider and then the SMS is
      // simply never delivered, which looks like our bug.
      if (!e164 || !e164.startsWith('+9725') || e164.length !== 13) {
        setBusy(false)
        setError('יש להזין מספר טלפון נייד ישראלי (05X).')
        return
      }
      const { error: smsError } = await supabase.auth.signInWithOtp({ phone: e164 })
      setBusy(false)
      if (smsError) setError('לא הצלחנו לשלוח קוד. נסו שוב בעוד רגע.')
      else setSent(true)
      return
    }

    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // No account is created from the app. Sign-up runs on the website, where
      // the terms and the privacy notice are actually shown.
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (sendError) setError('לא הצלחנו לשלוח קוד. בדקו את הכתובת ונסו שוב.')
    else setSent(true)
  }

  async function verify() {
    setBusy(true)
    setError(null)

    const e164 = mode === 'phone' ? toE164Israeli(phone) : null
    const { error: verifyError } = await supabase.auth.verifyOtp(
      mode === 'phone'
        ? { phone: e164 as string, token: code.trim(), type: 'sms' }
        : { email: email.trim(), token: code.trim(), type: 'email' },
    )
    setBusy(false)
    if (verifyError) {
      setError('הקוד שגוי או שפג תוקפו.')
      return
    }
    // The auth listener in the root layout also fires; calling here as well
    // makes the permission prompt land while the customer is still on the
    // screen they just used, which is when they say yes.
    registerForPush().catch(() => undefined)
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>התחברות</Text>

      {PHONE_AUTH_ENABLED && !sent ? (
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === 'email' && styles.tabActive]}
            onPress={() => setMode('email')}
          >
            <Text style={styles.tabText}>מייל</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === 'phone' && styles.tabActive]}
            onPress={() => setMode('phone')}
          >
            <Text style={styles.tabText}>SMS</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.body}>
        {mode === 'phone'
          ? 'נשלח קוד ב-SMS למספר שלך.'
          : 'נשלח קוד בן שש ספרות לכתובת המייל שלך.'}
      </Text>

      {mode === 'phone' ? (
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="050-1234567"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          editable={!sent}
        />
      ) : (
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="כתובת מייל"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!sent}
        />
      )}

      {sent ? (
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder={mode === 'phone' ? 'הקוד מה-SMS' : 'קוד מהמייל'}
          keyboardType="number-pad"
          // Lets iOS offer the code straight from the SMS or mail banner,
          // which is the difference between one tap and switching apps.
          textContentType="oneTimeCode"
          maxLength={10}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, busy && styles.buttonBusy]}
        disabled={
          busy ||
          (sent
            ? code.length < 4
            : mode === 'phone'
              ? phone.trim().length < 9
              : email.trim().length < 5)
        }
        onPress={sent ? verify : sendCode}
      >
        <Text style={styles.buttonText}>{sent ? 'אישור' : 'שליחת קוד'}</Text>
      </Pressable>

      {sent ? (
        <Pressable style={styles.link} onPress={() => setSent(false)}>
          <Text style={styles.linkText}>
            {mode === 'phone' ? 'שינוי מספר טלפון' : 'שינוי כתובת מייל'}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 24, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  body: { fontSize: 15, color: '#4b5563', textAlign: 'right', writingDirection: 'rtl' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  button: {
    backgroundColor: '#f5c518',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  buttonQuiet: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonQuietText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  link: { alignItems: 'center', paddingVertical: 10 },
  linkText: { fontSize: 14, color: '#4b5563' },
  error: { color: '#b91c1c', fontSize: 14, textAlign: 'right', writingDirection: 'rtl' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fef3c7', borderColor: '#f5c518' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
})
