Reselect.value('reselectChoicesOptions', {
	noOptionsText: 'No Options',
    choiceHeight: 36,
    listHeight:300
});

Reselect.directive('triggerAtBottom', ['$parse', 'ReselectUtils', function($parse, ReselectUtils) {

	var height = function(elem) {
		elem = elem[0] || elem;
		if (isNaN(elem.offsetHeight)) {
			return elem.document.documentElement.clientHeight;
		} else {
			return elem.offsetHeight;
		}
	};

	return {
		restrict: 'A',
		link: function($scope, $element, $attrs) {

			var scrolling = false;

			var triggerFn = ReselectUtils.debounce(function(){
				$parse($attrs.triggerAtBottom)($scope);
			}, 150);

			function checkScrollbarPosition() {
				if (height($element) + $element[0].scrollTop === 0 && $element[0].scrollHeight === 0) {
					return;
				}

				if (height($element) + $element[0].scrollTop >= $element[0].scrollHeight - 30) {
					triggerFn();
				}
				scrolling = false;
			}

			$element.on('scroll', function() {
				if (!scrolling) {
					if (!window.requestAnimationFrame) {
						setTimeout(checkScrollbarPosition, 300);
					} else {
						window.requestAnimationFrame(checkScrollbarPosition);
					}
					scrolling = true;
				}
			});

			checkScrollbarPosition();
		}
	};
}]);

Reselect.directive('reselectChoices', ['ChoiceParser', '$compile',
	'LazyScroller', 'LazyContainer', 'ReselectUtils', 'reselectChoicesOptions',
	function(ChoiceParser, $compile, LazyScroller, LazyContainer, ReselectUtils, reselectChoicesOptions) {
		return {
			restrict: 'AE',
			templateUrl: 'templates/reselect.options.directive.tpl.html',
			require: ['reselectChoices', '?^reselect'],
			transclude: true,
			replace: true,
			compile: function(element, attrs) {

				if (!attrs.options) {
					console.warn('[reselect-options] directive requires the [options] attribute.');
					return;
				}

				return function($scope, $element, $attrs, $ctrls, transcludeFn) {
					var $reselectChoices = $ctrls[0];
					var $Reselect = $ctrls[1];

					/**
					 * Manipulating the transluded html template taht is used to display
					 * each choice in the options list
					 */

					transcludeFn(function(clone, scope) {
						angular.element($reselectChoices.CHOICE_TEMPLATE[0].querySelectorAll('.reselect-option-choice-container')).append(clone);
					});

					$reselectChoices.LazyDropdown.initialize($reselectChoices.CHOICE_TEMPLATE);
					$reselectChoices.LazyDropdown.renderContainer();
				};
			},
			controllerAs: '$options',
			controller: ['$scope', '$element', '$attrs', '$parse', '$http', '$timeout',
				'ReselectDataAdapter', 'ReselectAjaxDataAdapter', 'KEYS',
				function($scope, $element, $attrs, $parse, $http, $timeout, ReselectDataAdapter,
					ReselectAjaxDataAdapter, KEYS) {

					var $Reselect = $element.controller('reselect');

					var self = this;

                    /**
					 * Options
					 */
					self.options = angular.extend({}, reselectChoicesOptions, $parse($attrs.reselectChoices)($scope) || {});

					self.options.noOptionsText = $attrs.noOptionsText || self.options.noOptionsText;

                    /**
                     * Variables
                     */
					self.element = $element[0];
					self.$container = angular.element(self.element.querySelectorAll(
						'.reselect-options-container'));
					self.$list = angular.element(self.element.querySelectorAll(
						'.reselect-options-list'));

					self.choiceHeight = self.options.choiceHeight;
					self.listHeight = self.options.listHeight;

					self.remotePagination = {};

					self.haveChoices = false;

					self.CHOICE_TEMPLATE = angular.element(
						'<li class="reselect-option reselect-option-choice" style="height: {{$options.choiceHeight}}px" ng-click="$options._selectChoice($index, $onClick)"></li>'
					);
                    self.CHOICE_TEMPLATE.append('<div class="reselect-option-choice-sticky" ng-show="$sticky === true" ng-bind-html="$stickyContent"></div>');
                    self.CHOICE_TEMPLATE.append('<div class="reselect-option-choice-container" ng-show="!$sticky"></div>');
					self.CHOICE_TEMPLATE.attr('ng-class',
						'[{\'reselect-option-choice--highlight\' : $options.activeIndex === $index, \'reselect-option-choice--selected\' : $options.selectedIndex === $index }, cssClass]'
					);
					self.CHOICE_TEMPLATE.attr('ng-mouseenter',
						'$options.activeIndex = $index');
					self.CHOICE_TEMPLATE.attr('ng-mouseleave',
						'$options.activeIndex = null');

                    /**
                     * Single Choice - Sticky Choices
                     */

                    self.stickyChoices = [];

                    self.registerChoices = function($choices){
                        angular.forEach($choices, function(choice){

                            choice = angular.element(choice);

                            var sticky = {
                                class         : choice.attr('class'),
                                $sticky       : true,
                                $stickyContent: choice.html()
                            };

                            if(choice.attr('ng-click')){
                                sticky.onClick = choice.attr('ng-click');
                            }

                            self.stickyChoices.push(sticky);
                        });
                    };

                    /**
                    * Keyboard Support
                    */

                    self.keydown = function(evt) {
                       var key = evt.which;

                       if (!key || evt.shiftKey || evt.altKey) {
                           return;
                       }

                       switch (key) {
                           case KEYS.ENTER:
                               $scope.$emit('reselect.select');

                               evt.stopPropagation();
                               evt.preventDefault();
                               break;
                           case KEYS.SPACE:
                               $scope.$emit('reselect.select');

                               evt.stopPropagation();
                               evt.preventDefault();
                               break;
                           case KEYS.UP:
                               $scope.$emit('reselect.previous');

                               evt.stopPropagation();
                               evt.preventDefault();
                               break;
                           case KEYS.DOWN:
                               $scope.$emit('reselect.next');

                               evt.stopPropagation();
                               evt.preventDefault();
                               break;
                           default:
                               break;
                       }
                    };

					/**
					 * Choices Functionalities
					 */

					$Reselect.parsedOptions = ChoiceParser.parse($attrs.options);

					if ($attrs.remote) {
						self.remoteOptions = $parse($attrs.remote)($scope.$parent);

						$Reselect.DataAdapter = new ReselectAjaxDataAdapter(self.remoteOptions, $Reselect.parsedOptions);

						$Reselect.DataAdapter.prepareGetData = function(){
							$Reselect.DataAdapter.page = 1;
							$Reselect.DataAdapter.pagination = {};
							$Reselect.DataAdapter.updateData([]);
							self.render();
						};
					} else {
						$Reselect.DataAdapter = new ReselectDataAdapter();
						$Reselect.DataAdapter.updateData($Reselect.parsedOptions.source($scope.$parent));

						$Reselect.DataAdapter.observe = function(onChange) {
							$scope.$watchCollection(function() {
								return $Reselect.parsedOptions.source($scope.$parent);
							}, function(newChoices) {
								$Reselect.DataAdapter.updateData(newChoices);
							});
						};

					}

					$Reselect.DataAdapter.init();

					self.getData = function(reset, loadingMore) {
						if(reset === true){
							$Reselect.DataAdapter.prepareGetData();
						}

						self.is_loading = true;

						$Reselect.DataAdapter.getData($Reselect.search_term)
							.then(function(choices) {
								if(!$Reselect.search_term){
									$Reselect.DataAdapter.updateData(choices.data, loadingMore);
									self.render();
								}else{
									self.render(choices.data);
								}
							})
							.finally(function(){
								self.is_loading = false;
							});
					};

					/**
					 * Load More function
					 *
					 * This function gets run when the user scrolls to the bottom
					 * of the dropdown OR the data returned to reselect does not
                     * fill up the full height of the dropdown.
					 *
					 * This function also checks if remote option's onData
					 * returns pagination.more === true
					 */

					self.loadMore = function() {
						if(!$Reselect.DataAdapter.pagination || !$Reselect.DataAdapter.pagination.more){
							return;
						}
						self.getData(false, true);
					};

					/**
					 * Search
					 */

					self.search = ReselectUtils.debounce(function(){
						self.getData(true, false);
					}, 300, false, function(){
						self.is_loading = true;
					});

					/**
					 * Lazy Containers
					 *
					 * The goal is to use the minimal amount of DOM elements (containers)
					 * to display large amounts of data. Containers are shuffled and repositioned
					 * whenever the options list is scrolled.
					 */

					self.LazyDropdown = new LazyScroller($scope, {
						scopeName: $Reselect.parsedOptions.itemName,
						container: self.$container,
						list: self.$list,
						choiceHeight: self.choiceHeight,
						listHeight: self.listHeight
					});

					/**
					 * An index to simply track the highlighted or selected option
					 */

					self.activeIndex = null;
					self.selectedIndex = null;

					/**
					 * Using the container id that is passed in, find the actual value by $eval the [value=""]
					 * from the directive with the scope of the lazy container
					 */

                    self._selectChoice = function(choiceIndex, choiceOnClick) {

                        if(choiceOnClick){
                            $parse(choiceOnClick)($scope.$parent);
                            $Reselect.hideDropdown();
                        }else{
                            self.selectedIndex = choiceIndex;

                            var selectedChoiceIndex = choiceIndex - self.stickyChoices.length;

                            var selectedScope = {};
                            selectedScope[$Reselect.parsedOptions.itemName] = self.LazyDropdown.choices[selectedChoiceIndex];
                            var value = angular.copy($Reselect.parsedOptions.modelMapper(selectedScope));
                            $Reselect.selectValue(value, selectedScope[$Reselect.parsedOptions.itemName]);
                        }
                    };

                    self.bindEventListeners = function() {
                        $scope.$on('reselect.select', function() {
                            self._selectChoice(self.activeIndex);
                        });

                        $scope.$on('reselect.next', function() {

                            var container_height = self.$container[0].offsetHeight;
                            var container_top    = self.$container[0].scrollTop;

                            if(self.activeIndex !== null) {
                                if(self.activeIndex < $Reselect.DataAdapter.data.length - 1) {
                                    self.activeIndex++;
                                }
                            } else {
                                self.activeIndex = 0; // Start at the first element
                            }

                            if((container_top + container_height) < ((self.activeIndex * self.choiceHeight) + self.choiceHeight)) {
                                self.$container[0].scrollTop = ((self.activeIndex * self.choiceHeight) - container_height) + self.choiceHeight;
                            }
                        });

                        $scope.$on('reselect.previous', function() {

                            var container_top = self.$container[0].scrollTop;

                            if(self.activeIndex) {
                                self.activeIndex--;
                            } else {
                                self.activeIndex = 0;
                            }

                            if(container_top > ((self.activeIndex * self.choiceHeight))) {
                                self.$container[0].scrollTop = container_top - self.choiceHeight;
                            }
                        });
                    };

					/**
					 * Rendering
					 *
					 * This function handles rendering the dropdown.
					 * Choices are passed along to LazyContainer which will
					 * handle the rendering of the data.
					 */

					self.render = function(choices) {
						self.LazyDropdown.choices = choices || $Reselect.DataAdapter.data;

                        self.LazyDropdown.choices = self.stickyChoices.concat(self.LazyDropdown.choices);

						if(self.LazyDropdown.choices && self.LazyDropdown.choices.length >= 0){
							// Check if choices is empty
							self.haveChoices = !!self.LazyDropdown.choices.length;

							// Render the dropdown depending on the numbers of choices
							var dimensions = self.LazyDropdown.renderContainer();

							/**
							 * LazyContainer's render function
							 * @param {Boolean} Force - force the LazyContainer to re-render
							 */
							self.LazyDropdown._calculateLazyRender(true);

							/**
							 * If the result's first page does not fill up
							 * the height of the dropdown, automatically fetch
							 * the next page
							 */

							if(self.LazyDropdown.choices && self.LazyDropdown.choices.length && (dimensions.containerHeight >= dimensions.choiceHeight)){
								self.loadMore();
							}
						}else{
							self.haveChoices = false;
						}
					};

                    self.bindEventListeners();
				}
			]
		};
	}
]);
