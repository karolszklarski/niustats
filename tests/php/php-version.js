// The PHP version of the site, used by the tests that run in Docker. public/.ovhconfig sets it on the host, and a
// unit test keeps the two the same. For a new version, change both: the tests print every warning and deprecation,
// so they show what to fix.
export const PHP_VERSION = '8.5.11';
