/**
 * Switches for features that are built but turned off for now.
 *
 * OTP_LOGIN_ENABLED: login with a code sent by SMS (MSG91), for clients ("Mobile OTP" on the login
 * page) and customers ("Ordered from another phone?" in My orders). Off until MSG91 and DLT are
 * set up: OTP_PROVIDER / MSG91_* are then not needed, and the OTP routes answer "switched off".
 * To turn it back on: set this to true and configure OTP_PROVIDER=msg91 (README, "MSG91 setup").
 */
export const OTP_LOGIN_ENABLED = false;

/** Shown when someone reaches an OTP screen while OTP login is switched off. */
export const OTP_OFF_MESSAGE = "Login with a mobile OTP is switched off. Use your email and password.";
