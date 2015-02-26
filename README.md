# What it is
 Node.js bootstrapping framework designed with extensibility in mind for fast application prototyping and production-ready applications.  
 It comes with a set of core components suitable for almost any kind of front-end (angular, browserify, sass/less, watchers) or back-end (express promisified routing, mysql, mongoose & redis) projects.  
 It also allows the developer to plug in components and load them on-demand.  

## Front-end developers
 - Lifts up the hassle of setting up a development environment, less/sass compilers, watchers, static HTTP servers and browser refreshes. Just hit *npm install [less|sass]* and you're ready to go!
 - Angular applications will find it extremely useful as it comes with support for angular projects, from javaScript compilation and environment-specific configuration loading to view caching an watchers
 - Common JS application support with browserify and aliasify, with extensive configuration, transform support and more
 - Integrated and easily configured browsersync module for static file serving and auto-reloading web pages on asset change

## Back-end developers
 - Provides stability in over your project structure with auto-loaders, well-established component life cycle while gracefully embraces promises in most application aspects. 
 - Configuration, environment settings and project settings are easily managed via configuration files (json, js or yaml)
 - The model-layer of your application is provided by a wrapper over Sequelize ORM API, to easily define relationships between models (in a single file, with no other dependencies)
 - The controller-layer offers powerful features to define routes (pre-requisite parameters and functionality definition) in a promisified way
 - Automatically load and map routes under your predefined route/ folder, keeping your app.js file nice and tidy
 - Promisified wrapper over the redis module, with support for publish/subscribe functionality without any server-connection hassle
 - Separation of concern between your routes, models and views by adding the *service* level, fully equipped with auto-loading, naming and inheritance
 
## Example applications
 - [Angular & less](https://github.com/PearlVentures/Crux-apps/tree/master/angular-less) served by the static component
 - [CommonJS & sass](https://github.com/PearlVentures/Crux-apps/tree/master/commonjs-sass) also served by the static component
  
  
  
## License 
  [MIT](LICENSE)
(The MIT License)

Copyright (c) 2014-2015 PearlVentures

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
