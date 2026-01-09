import { start } from "./app";

// Start the application
(async () => {
  await start();
  console.log(`\nBot started, app listening to`, process.env.PORT || process.env.port || 3978);
})();
