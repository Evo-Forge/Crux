<!DOCTYPE html>
<html>
<head lang="en">
   <meta charset="UTF-8">
   <title>An error occurred.</title>
</head>
<body>
<h2>An error occurred.</h2><br/>
<b>{{ error.code }}</b><br/>
<b>{{ error.message }}</b>
{% if error.request_id %}
   <br /> Request {{ error.request_id }}
{% endif %}
</body>
</html>