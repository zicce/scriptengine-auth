#include "se_auth.h"

int main() {
    const std::string key = "";
    const std::string hwid = "";

    // Change the host and the application name.
    SeAuthResult auth = se_authorize(L"your-panel-host", key, hwid, "Aim Assist");
    if (!auth.ok)
        return 1;

    // auth.expires is an ISO-8601 time, or the word lifetime.
    return 0;
}
