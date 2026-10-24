/**
 * Capacitor configuration.
 * BACKLOG Item 5: Native app setup (Capacitor recommended over Expo).
 *
 * Ready for mobile app development when revenue milestone reached.
 * See docs/NATIVE-APP-EVALUATION.md for implementation plan.
 */

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'co.il.kenyonexpress',
  appName: 'Kenyon Express',
  webDir: 'out', // Next.js static export output

  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },

  // iOS configuration
  ios: {
    contentInset: 'always',
    scheme: 'Kenyon Express',
  },

  // Android configuration
  android: {
    buildOptions: {
      keystorePath: undefined, // Set in production
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK',
    },
  },

  // Plugins configuration
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },

    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    StatusBar: {
      style: 'light',
      backgroundColor: '#ffffff',
    },
  },
}

export default config
