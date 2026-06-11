async function callDebug() {
  try {
    const url = 'https://nmumnletxkeflmsythsn.supabase.co/functions/v1/line-bot';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'debug_info' })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log("Response data:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error("Failed with status:", response.status);
      const errText = await response.text();
      console.error("Error text:", errText);
    }
  } catch (error) {
    console.error("Error calling debug endpoint:", error);
  }
}

callDebug();
