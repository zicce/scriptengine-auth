import LoginStage from "./LoginStage";
import ResellerLogin from "./ResellerLogin";

export const LOGIN_ERRORS = {
  not_reseller: "This Discord account is not a reseller or helper.",
  team_off: "Team access is turned off for this account.",
  denied: "Discord sign-in was cancelled.",
  discord: "Discord sign-in failed. Try again.",
  config: "Discord login is not configured yet.",
  turnstile: "Complete the Cloudflare check, then sign in again.",
  session: "Sign in with Discord to open the reseller panel.",
};

export default function ResellerLoginView({ message = "", demo = false }) {
  return (
    <LoginStage kind="reseller">
      <section className="loginCard">
        <div className="loginCardHead">
          <span className="loginCardMark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M19.27 5.33A17.4 17.4 0 0 0 15.11 4l-.22.4a16.1 16.1 0 0 1 4.06 1.54 16.4 16.4 0 0 0-12.9 0A16.4 16.4 0 0 1 10.1 4.4L9.89 4a17.4 17.4 0 0 0-4.16 1.33C3.1 8.9 2.4 12.37 2.6 15.8a17.6 17.6 0 0 0 5.32 2.69l.68-1.12a11.5 11.5 0 0 1-1.7-.82l.42-.33c3.28 1.52 6.84 1.52 10.08 0l.42.33c-.54.33-1.11.6-1.7.82l.68 1.12a17.6 17.6 0 0 0 5.32-2.69c.3-4.05-.51-7.49-2.15-10.47ZM9.2 14.3c-.99 0-1.8-.92-1.8-2.04 0-1.13.8-2.05 1.8-2.05s1.82.93 1.8 2.05c0 1.12-.8 2.04-1.8 2.04Zm5.6 0c-.99 0-1.8-.92-1.8-2.04 0-1.13.8-2.05 1.8-2.05s1.82.93 1.8 2.05c0 1.12-.79 2.04-1.8 2.04Z"
              />
            </svg>
          </span>
          <div>
            <h2>Sign in</h2>
            <p>Use the Discord account your administrator added.</p>
          </div>
        </div>
        <ol className="loginSteps">
          <li><span>1</span>Check</li>
          <li><span>2</span>Discord</li>
          <li><span>3</span>Panel</li>
        </ol>
        {message ? <div className="loginAlert">{message}</div> : null}
        <ResellerLogin demo={demo} />
        <p className="loginFoot">The panel opens only for reseller and helper accounts.</p>
        <div className="loginMore">
          <div className="loginPathHead">
            <p className="loginKicker">Become a reseller</p>
            <strong>From an appeal to your first license.</strong>
          </div>
          <ol className="loginPathSteps">
            <li>
              <span>1</span>
              <div>
                <strong>Appeal</strong>
                <p>Send an appeal and say how you want to sell.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Review</strong>
                <p>Staff reads it and opens the account if it fits.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>First key</strong>
                <p>Sign in and generate your first license.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>
    </LoginStage>
  );
}
