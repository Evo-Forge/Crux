{# This is our main layout, containing the js,css,etc #}
<!DOCTYPE html>
<html lang="en">
<head>
   <meta charset="utf-8">
   <meta http-equiv="X-UA-Compatible" content="IE=edge">
   <meta name="viewport" content="width=device-width, initial-scale=1">
   <meta name="description" content="">
   <meta name="author" content="">
   <title>{% block title %}Demo app{% endblock %}</title>
   <!-- Bootstrap Core CSS - Uses Bootswatch Flatly Theme: http://bootswatch.com/flatly/ -->
   <link href="{{ asset('css/bootstrap.min.css') }}" rel="stylesheet">
   <!-- Custom CSS -->
   <link href="{{ asset('css/freelancer.css') }}" rel="stylesheet">
   <link href="{{ asset('css/demo.css') }}" rel="stylesheet">
   <!-- Custom Fonts -->
   <link href="{{ asset('css/font-awesome.min.css') }}" rel="stylesheet" type="text/css">
   <link href="http://fonts.googleapis.com/css?family=Montserrat:400,700" rel="stylesheet" type="text/css">
   <link href="http://fonts.googleapis.com/css?family=Lato:400,700,400italic,700italic" rel="stylesheet" type="text/css">
   {% block css %}{% endblock %}
   {# We include our js files #}
   <script src="{{ asset('js/lib/jquery-1.11.2.min.js') }}"></script>
   <script src="{{ asset('js/lib/bootstrap.min.js') }}"></script>
   <script src="{{ asset('js/lib/angular/angular-1.3.5.js') }}"></script>
   <script src="{{ asset('js/lib/angular/angular-ui-router.js') }}"></script>

   {# We then include other custom dependency libraries #}
   {% block scripts %}{% endblock %}
   {# We now include our angular build. #}
   <script src="{{ asset('js/build/app.angular.js') }}"></script>
   <script src="{{ asset('js/build/app.templates.js') }}"></script>

   {# Finally we include our plugin #}
   <script src="{{ asset('js/build/demo.' + environment + '.js') }}"></script>
</head>
<body id="page-top" class="index">
<!-- Navigation -->
<nav class="navbar navbar-default navbar-fixed-top">
   <div class="container">
      {% block header %}
         {% include "partials/menu.swig" %}
      {% endblock %}
   </div>
   <!-- /.container-fluid -->
</nav>
{% include "partials/header.swig" %}

<!-- Angular application or any other view content -->
{% block content %}{% endblock %}

{# Footer section #}
{% include "partials/footer.swig" %}

   <!-- Scroll to Top Button (Only visible on small and extra-small screen sizes) -->
   <div class="scroll-top page-scroll visible-xs visble-sm">
      <a class="btn btn-primary" href="#page-top">
         <i class="fa fa-chevron-up"></i>
      </a>
   </div>
</body>

</html>
