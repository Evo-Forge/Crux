<html>
    <head>
        <title>HTTP Route documentation</title>
    </head>
    <body>
        <div class="main-container">
            {% for ns in routes %}
                <div class="route" style="padding: 20px; margin: 5px 0; border: 1px solid black;">
                    <div class="name" style="padding: 5px; width: 100%; border-bottom: 1px solid black;">
                        Namespace <b>{{ ns.__namespace }}</b> &nbsp; - /{{ ns.__rootPath }}
                    </div>
                    <div class="endpoints">
                        {% for name, endpoint in ns.__endpoints %}
                            <div class="endpoint" style="padding: 5px; border-bottom: 1px solid gainsboro; margin: 2px 0; width: 100%;">
                                <b>{{ endpoint.method |upper }}</b> &nbsp; {{ ns.__rootPath }}{{ endpoint.path }} <br/>
                                <div class="query" style="margin-left: 10px;">
                                    {% for qs in endpoint.parameters.query %}
                                        {% if loop.index == 1 %}
                                            <b>QUERY STRING</b><br/>
                                        {% endif %}
                                        {{ qs.name }} : {{ qs.validate.type }}<br/>
                                    {% endfor %}
                                </div>
                                <div class="body" style="margin-left: 10px;">
                                    {% for qs in endpoint.parameters.body %}
                                        {% if loop.index == 1 %}
                                            <b>POST DATA</b><br/>
                                        {% endif %}
                                        {{ loop.index }}
                                        {{ qs.name }} : {{ qs.validate.type }}<br/>
                                    {% endfor %}
                                </div>
                            </div>
                        {% endfor %}
                    </div>
                </div>
            {% endfor %}
        </div>
    </body>
</html>