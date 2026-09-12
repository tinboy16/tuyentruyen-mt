FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY game.js /usr/share/nginx/html/game.js

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80