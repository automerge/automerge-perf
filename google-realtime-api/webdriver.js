const {Builder, By, until} = require('selenium-webdriver');
let mainWindow, popupWindow;

new Builder()
    .forBrowser('chrome')
    .build()
    .then(driver => {
      return driver.get('http://localhost:8000')
        .then(_ => driver.manage().timeouts().implicitlyWait(10000))
        .then(_ => driver.manage().timeouts().pageLoadTimeout(10000))
        .then(_ => driver.getWindowHandle())
        .then(h => { mainWindow = h; return driver.wait(until.elementIsVisible(driver.findElement(By.id('auth_button'))), 10000); })
        .then(_ => driver.findElement(By.id('auth_button')).click())
        .then(_ => driver.getAllWindowHandles())
        .then(h => { popupWindow = h.filter(x => x != mainWindow)[0]; return driver.switchTo().window(popupWindow); })
        .then(_ => driver.wait(until.elementLocated(By.id('identifierId')), 10000))
        .then(_ => driver.findElement(By.id('identifierId')).sendKeys('trvedatatest'))
        .then(_ => driver.findElement(By.id('identifierNext')).click())
        .then(_ => new Promise(resolve => setTimeout(resolve, 2000)))
        .then(_ => driver.wait(until.elementIsVisible(driver.findElement(By.css('input[type="password"]'))), 10000))
        .then(_ => driver.findElement(By.css('input[type="password"]')).sendKeys('R6YfLwBMDwW6YbRhAKcgp^7p'))
        .then(_ => driver.findElement(By.id('passwordNext')).click())
        /*.then(_ => driver.findElement(By.id('submit_approve_access')).click())*/
        .then(_ => driver.switchTo().window(mainWindow))
        .then(_ => driver.wait(until.elementIsVisible(driver.findElement(By.css('textarea'))), 10000))
        .then(_ => driver.findElement(By.id('replay_button')).click())
        .then(_ => driver.wait(until.elementTextMatches(driver.findElement(By.id('status')), /Finished replaying edit trace/), 1e9))
        .then(_ => driver.quit());
    });
