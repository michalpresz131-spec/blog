# Low-cost deployment

The low-cost setup serves the static UI from GitHub Pages (HTTPS) and runs the
existing Express API on AWS Lambda through a Lambda Function URL. The API uses
the existing Turso database. No always-on server, Application Load Balancer,
API Gateway, or CloudFront distribution is needed.

Keeping the page on GitHub Pages gives the moderator login HTTPS without the
additional cost and setup of an AWS CDN. The Lambda Function URL is public;
do not put Turso credentials in `aws-config.js` or any browser code.

## Costs

This avoids the always-on Fargate task and load balancer. Lambda has an AWS
Free Tier request and compute allowance; if usage exceeds the allowance, Lambda
requests and compute are billed. Standard Systems Manager Parameter Store
parameters are used for the encrypted runtime configuration. Turso usage is
subject to Turso's plan. Check the AWS Billing console for current account
credits and set a billing alert before publishing; Free Tier eligibility and
prices depend on the account and can change.

## AWS resources

The deployment uses:

- One Lambda function (`allotmentality-blog-api`) with a public Function URL.
- One Standard SecureString Parameter Store parameter at
  `/allotmentality/blog/production`, readable only by the Lambda role.
- A Lambda execution role scoped to that parameter.

Set the required settings in the encrypted parameter: `TURSO_DATABASE_URL`,
`TURSO_AUTH_TOKEN`, and `ADMIN_PASSWORD`. Optional settings are
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `NOTIFY_EMAIL`.

The Lambda reads and decrypts the parameter once per execution environment; the
secrets never go to the browser. `aws-config.js` contains only the public API
URL and can safely be published with the static page.

Post images remain stored in Turso. The Lambda resizes them to JPEG when serving
them and returns them as binary data, keeping image responses within the Lambda
payload limit.

## Publish the static page

The GitHub Actions workflow publishes `index.html`, `app.js`, `aws-config.js`,
`style.css`, and `assets/` to GitHub Pages on a push to `main`. Publish the
Lambda Function URL in `aws-config.js`:

```js
window.BLOG_API_BASE_URL = 'https://YOUR_FUNCTION_URL.lambda-url.us-east-1.on.aws'
```

The URL is public; it is not an AWS credential. Keep GitHub Pages configured to
use **GitHub Actions** as its publishing source.

## Build and deploy the API

The Lambda entry point is `lambda.js`; it wraps the existing Express app.
Package it for Linux with the production dependencies from `package-lock.json`,
then upload the resulting `lambda.zip` to a private S3 bucket and create/update
the Lambda function using the AWS CLI. Use the `nodejs22.x` runtime, a 512 MB
memory setting, and a timeout appropriate for Turso requests.

Create the Lambda execution role with the
`AWSLambdaBasicExecutionRole` managed policy and an inline policy that grants
`ssm:GetParameter` and `kms:Decrypt` only for the runtime parameter. Set
`BLOG_CONFIG_PARAMETER=/allotmentality/blog/production` on the function.
Create a Function URL with `AuthType=NONE`; the blog API is intentionally
public. The Express app responds to CORS preflight requests.

The initial image-build S3 bucket, ECR repository, and ECS setup roles are not
needed for this deployment and should be removed after the Lambda has been
published.
