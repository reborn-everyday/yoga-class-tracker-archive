"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
// Start the application
(async () => {
    await (0, app_1.start)();
    console.log(`\nBot started, app listening to`, process.env.PORT || process.env.port || 3978);
})();
//# sourceMappingURL=index.js.map