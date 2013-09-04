"use strict";

_.templateSettings = {
  evaluate:    /\{\{#([\s\S]+?)\}\}/g,            // {{# console.log("blah") }}
  interpolate: /\{\{[^#\{]([\s\S]+?)[^\}]\}\}/g,  // {{ title }}
  escape:      /\{\{\{([\s\S]+?)\}\}\}/g,         // {{{ title }}}
};

var SoulPlayer = (function() {

  var Mixins = {
    FormatDuration: {
      formatDuration: function(seconds) {
        var minutes = Math.floor(seconds/60);
        var remainingSeconds = seconds % 60;
        var result = '';
        if (remainingSeconds < 10) {
          result = "0";
        }
        result += String(remainingSeconds);
        result = minutes + ":" + result;
        return result;
      }
    }
  };

  var Services = (function() {
    var NowPlaying = Backbone.Model.extend({
      play: function(album, song) {
        this.set('album', album);
        this.set('song', song);
        this.trigger('play');
      }
    });

    var NowPlayingSingleton = function(){};
    _.extend(NowPlayingSingleton, {
      sharedInstance: function() {
        if (this._instance === undefined)
          this._instance = new NowPlaying();
        return this._instance;
      }
    });

    return { NowPlaying: NowPlayingSingleton };
  })();

  var Models = (function() {
    var Album = Backbone.Model.extend({
      url: function() {
        return "/app/albums/" + this.get('id') + ".json";
      }
    });

    return { Album: Album };
  })();

  var Collections = (function() {
    var Albums = Backbone.Collection.extend({
      url: '/app/albums/albums.json',
      model: Models.Album,

      initialize: function() {
        this._order_by_artist = this.comparator;
      },

      comparator: function(album) {
        return album.get('artist');
      },

      order_by_artist: function() {
        this.comparator = this._order_by_artist;
        this.sort();
      },

      order_by_title: function() {
        this.comparator = this._order_by_title;
        this.sort();
      },

      _order_by_title: function(album) {
        return album.get('title');
      }
    });

    return { Albums: Albums };
  })();

  var Views = (function() {
    var Albums = Backbone.View.extend({
      tagName: 'ul',
      className: 'album-list cf',
      queryString: null,

      initialize: function(options) {
        this.collection.on('add', this.render, this);
        options.filter.on('soulPlayer:filter:query', this.setQueryFilter, this);
        options.filter.on('soulPlayer:filter:sortBy', this.sortBy, this);
      },

      setQueryFilter: function(query) {
        this.queryString = query;
        this.render();
      },

      sortBy: function(sort) {
        if (sort === 'title') {
          this.collection.order_by_title();
        } else {
          this.collection.order_by_artist();
        }
        this.render();
      },

      addAlbum: function(model) {
        (new Album({model: model})).render().$el.appendTo(this.$el);
      },

      addAll: function() {
        var query = this.queryString;
        var re = new RegExp(query, "gi");
        this.collection.each(function(album) {
          if (query) {
            var artistAlbum = _.values(album.pick('artist', 'title')).join(', ');
            if (artistAlbum.match(re)) {
              this.addAlbum(album);
            }
          } else {
            this.addAlbum(album);
          }
        }, this);
      },

      render: function() {
       this.$el.empty();
       this.addAll();
       $('#container').append(this.$el);
       return this;
      }
    });

    var Album = Backbone.View.extend({
      tagName: 'li',
      events: {
        'click img': 'showDetails'
      },

      template: _.template(
        '<img src="{{ imageUrl }}"/>' +
        '<h2>{{ artist }}</h2>' +
        '<h3>{{ title }}</h3>'
      ),

      render: function() {
        this.$el.html(this.template(this.model.attributes));
        return this;
      },

      showDetails: function() {
        Backbone.history.navigate(['albums', this.model.get('id')].join('/'), true);
      }
    });

    var AlbumDetail = Backbone.View.extend({
      className: 'album-details cf',
      template: _.template(
        '<caption><h2>{{ title }}</h2>' +
        '<h3>{{ artist }}</h3></caption>'
      ),

      initialize: function(options) {
        this.model.on('change', this.render, this);
      },

      render: function() {
        this.$el.html('<table>'+this.template(this.model.attributes)+'</table>');
        $('#container').append(this.$el);
        (new Songs({model: this.model}).render()).$el.appendTo(this.$el.find('table'));
        (new AlbumCover({model: this.model}).render()).$el.appendTo(this.$el);
        (new TotalDuration({model: this.model}).render()).$el.appendTo(this.$el.find('table'));
        return this;
      }
    });

    var Songs = Backbone.View.extend({
      tagName: 'tbody',

      render: function() {
        this.$el.empty();
        _.each(this.model.get('songs'), function(song) {
          this.$el.append((new Song({model: song, album: this.model})).render().el);
        }, this);
        return this;
      }
    });

    var Song = Backbone.View.extend(_.extend({
      tagName: 'tr',
      className: 'album-track',
      template: _.template(
        '<td class="track-number"><span class="track">{{ track }}</span>' +
        '<span class="play-arrow">▶</span></td>' +
        '<td class="track-title">{{ title }}</td>' +
        '<td class="track-time">{{ formatedDuration }}</td>'
      ),
      events: {
        'click .track-title': 'playSong'
      },

      initialize: function(options) {
        this.album = options.album;
      },

      playSong: function() {
        var nowPlaying = Services.NowPlaying.sharedInstance();
        nowPlaying.play(this.album, this.model);
      },

      render: function() {
        this.$el.html(this.template(
          _.extend(this.model, {formatedDuration: this.formatDuration(this.model.duration)})
        ));
        return this;
      }
    }, Mixins.FormatDuration));

    var TotalDuration = Backbone.View.extend(_.extend({
      tagName: 'tfoot',
      template: _.template(
        '<tr><td colspan="3" class="total-time">Total time: {{ totalDuration }}</td></tr>'
      ),

      totalDuration: function() {
        var sum = _.reduce(_.pluck(this.model.get('songs'), 'duration'), function(total, duration) {
          return parseInt(total) + parseInt(duration);
        }, 0);
        return this.formatDuration(sum);
      },

      render: function() {
        this.$el.html(this.template({
          totalDuration: this.totalDuration()
        }));
        return this;
      }
    }, Mixins.FormatDuration));

    var AlbumCover = Backbone.View.extend({
      className: 'album-cover cf',
      template: _.template(
        '<img src="{{ imageUrl }}" />' +
        '<div class="gradient"></div>'
      ),

      initialize: function(options) {
        this.model.on('change', this.render, this);
      },

      render: function() {
        this.$el.html(this.template(this.model.attributes));
        $('#container').append(this.$el);
        return this;
      }
    });

    var FilterList = Backbone.View.extend({
      tagName: 'ul',
      className: 'search cf',
      searchTemplate: _.template(
        '<li><input class="search-box" placeholder="Search by artist or album"></li>'
      ),
      filterTemplate: _.template(
        '<li><span>Sort by: </span>' +
        '<select id="sort-by">' +
        '<option value="artist">Artist</option><option value="title">Album</option>' +
        '</select></li>'
      ),
      events: {
        'keyup .search-box': 'query',
        'change #sort-by':   'sortBy'
      },

      sortBy: function() {
        this.trigger('soulPlayer:filter:sortBy', $('#sort-by').val());
      },

      query: function() {
        this.trigger('soulPlayer:filter:query', $('.search-box').val());
      },

      render: function() {
        $('#container').append(this.$el);
        $('#container ul.search').append(this.searchTemplate());
        $('#container ul.search').append(this.filterTemplate());
        return this;
      }
    });

    var AudioDisplay = Backbone.View.extend(_.extend({
      template: _.template(
        '<img src="{{ albumImageUrl }}"/>' +
        '<button id="play-button" class="play">❙❙</button>' +
        '<div class="song-details">' +
          '<h3>{{ songTitle }}</h3>' +
          '<h4>{{ albumArtist }} - {{ albumTitle }}</h4>' +
        '</div>'
      ),

      initialize: function(options) {
        this.model.on('play', this.render, this);
      },

      render: function() {
        if (this.model.get('song')) {
          this.$el.find('#player-welcome').remove();
          var songDetails = {
            albumImageUrl: this.model.get('album').get('imageUrl'),
            songTitle: this.model.get('song').title,
            albumArtist: this.model.get('album').get('artist'),
            albumTitle: this.model.get('album').get('title')
          }
          this.$el.html(this.template(songDetails));
          var playButton = new PlayButton({ el: $('#play-button') });
          playButton.render();
          var player = new AudioPlayer({ model: this.model, el: $('#audio-player') });
          player.render();
          var duration = new AudioDuration({ el: $('#song-duration') });
          duration.render();
        }
        return this;
      }
    }, Mixins.FormatDuration));

  var PlayButton = Backbone.View.extend({
    events: {
      'click': 'togglePlaying'
    },

    togglePlaying: function() {
      var $audio = $('#audio-player')[0];
      if (this._isPlaying) {
        this._isPlaying = false;
        $audio.pause();
      } else {
        this._isPlaying = true;
        $audio.play();
      }
      this.render();
    },

    initialize: function(options) {
      this._isPlaying = true;
    },

    render: function() {
      this.$el.html(this._isPlaying ? '❙❙' : '▶');
    }
  });

    var AudioPlayer = Backbone.View.extend({
      initialize: function(options) {
        this.model.on('change:song', this.render, this);
      },

      render: function(){
        this.$el[0].src = this.model.get('song').mp3Url;
        return this;
      }
    });

    var AudioDuration = Backbone.View.extend(_.extend({
      template: _.template(
        '<span>{{ formatedDuration }}</span>'
      ),
      _currentTime: 0,

      initialize: function() {
        var $audio = $('#audio-player');
        var that = this;

        $audio.on('loadedmetadata', function() {
          that._currentTime = 0;
        });

        $audio.on('ended', function() {
          that._currentTime = 0;
          that.render();
          this.load();
        });

        $audio.on('timeupdate', function() {
          that._currentTime = Math.floor(this.currentTime);
          that.render();
        });
      },

      render: function() {
        this.$el.html(this.template({formatedDuration: this.formatDuration(this._currentTime)}));
        return this;
      }
    }, Mixins.FormatDuration));

    return { Albums: Albums, AlbumDetail: AlbumDetail,
             AlbumCover: AlbumCover, FilterList: FilterList, AudioDisplay: AudioDisplay };
  })();

  return { Models: Models, Collections: Collections, Views: Views, Services: Services };
})();

new (Backbone.Router.extend({
  initialize: function() {
    Backbone.history.start();
  },

  routes: {
    "":           "albumList",
    "albums/:id": "albumDetail"
  },

  clearContainer: function() {
    $('#container').empty();
  },

  albumList: function() {
    this.clearContainer();
    var albums = new SoulPlayer.Collections.Albums();
    var filterView = new SoulPlayer.Views.FilterList();
    filterView.render();
    new SoulPlayer.Views.Albums({collection: albums, filter: filterView});
    albums.fetch();
  },

  albumDetail: function(id) {
    this.clearContainer();
    var album = new SoulPlayer.Models.Album({id: id});
    new SoulPlayer.Views.AlbumDetail({model: album, nowPlaying: SoulPlayer.Services.NowPlaying.sharedInstance()});
    album.fetch();
  }
}));

$(function() {
  (new SoulPlayer.Views.AudioDisplay({ model: SoulPlayer.Services.NowPlaying.sharedInstance(),
                                      el: $('#audio-player-container') })).render();
});
