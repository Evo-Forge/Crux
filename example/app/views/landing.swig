{#
 * View File: landing
 * Created by adrianbunta on 1/12/2015.
#}
{% extends "layout.swig" %}
{% block title %}Hello Demo app!{% endblock %}

{% block content %}
<section id="portfolio">
   <div class="container">
      {# We are placing our angular app here. #}
      <div class="row" ng-app="app" ui-view></div>
   </div>
</section>
{% endblock %}