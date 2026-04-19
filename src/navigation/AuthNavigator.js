/**
 * @fileoverview Auth navigation stack for unauthenticated users.
 *
 * This navigator is shown when no user is logged in. It contains
 * the Login and Signup screens with a clean, headerless presentation.
 *
 * Navigation flow:
 *   Login  ──(tap "Sign Up")──▶  Signup
 *   Signup ──(tap "Sign In")──▶  Login
 *   Either ──(auth success)──▶   AppNavigator (handled by App.js)
 *
 * @module navigation/AuthNavigator
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import LoginScreen  from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';

const Stack = createStackNavigator();

/**
 * Fade transition config — smoother than the default slide for auth screens.
 * @type {import('@react-navigation/stack').StackCardInterpolationProps}
 */
const fadeTransition = {
  cardStyleInterpolator: ({ current }) => ({
    cardStyle: { opacity: current.progress },
  }),
  transitionSpec: {
    open:  { animation: 'timing', config: { duration: 220 } },
    close: { animation: 'timing', config: { duration: 180 } },
  },
};

/**
 * AuthNavigator — Stack navigator for the unauthenticated flow.
 *
 * Both screens hide the navigation header; each screen manages its
 * own header-like UI so we can fully control branding and layout.
 *
 * @returns {React.ReactElement}
 */
export default function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,        // Each screen handles its own top area
        ...fadeTransition,
        cardStyle: { backgroundColor: '#F8F9FE' },
      }}
    >
      {/* ── Login Screen ─────────────────────────────────────────────────── */}
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: 'Sign In' }}  // title used by screen readers
      />

      {/* ── Signup Screen ────────────────────────────────────────────────── */}
      <Stack.Screen
        name="Signup"
        component={SignupScreen}
        options={{ title: 'Create Account' }}
      />
    </Stack.Navigator>
  );
}
