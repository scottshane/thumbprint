import React, { useState, forwardRef, useEffect } from 'react';
import find from 'lodash/find';
import classNames from 'classnames';
import warning from 'warning';
import PropTypes from 'prop-types';
import scrollparent from 'scrollparent';
import { useInView } from 'react-intersection-observer';
import canUseDOM from '../../utils/can-use-dom';
import styles from './index.module.scss';

// --------------------------------------------------------------------------------------------
// Steps in rendering Image
//
// 1. Picture is rendered without src, srcSets, and with a padding-top placholder on the <img>
// based on the containerAspectRatio.
// 2. The "sizes" attr is calculated on initial render to determine width of image.
// 3. When lazyload is triggered the src and scrSet props are populated based on the sizes value.
// 4. The image onLoad event removes padding-top placholder and fades in the image.
// --------------------------------------------------------------------------------------------

const Image = forwardRef((props, outerRef) => {
    const {
        src,
        sources,
        height,
        containerAspectRatio,
        objectFit,
        objectPosition,
        alt,
        className,
        ...rest
    } = props;

    // The outermost DOM node that this component references. We use `useState` instead of
    // `useRef` because callback refs allow us to add more than one `ref` to a DOM node.
    const [containerRef, setContainerRef] = useState(null);

    // --------------------------------------------------------------------------------------------
    // Sizes
    // --------------------------------------------------------------------------------------------

    // Used by srcSet to determine which image in the list will be requested. This value has to be
    // calculated client-side because we don't know the viewport width.

    const sizes =
        containerRef && containerRef.clientWidth ? `${containerRef.clientWidth}px` : '0px';

    // --------------------------------------------------------------------------------------------
    // Lazy-loading: library setup and polyfill
    // --------------------------------------------------------------------------------------------

    // IntersectionObserver's `root` property identifies the element whose bounds are treated as
    // the bounding box of the viewport for this element. By default, it uses `window`. Instead
    // of using the default, we use the nearest scrollable parent. This is the same approach that
    // React Waypoint and lazysizes use. The React Waypoint README explains this concept well:
    // https://git.io/fj00H

    const parent = canUseDOM && scrollparent(containerRef);
    const root = parent && (parent.tagName === 'HTML' || parent.tagName === 'BODY') ? null : parent;

    // `shouldLoadImage` becomes `true` when the lazy-loading functionality decides that we should
    // load the image.
    const [inViewRef, shouldLoadImage] = useInView({
        root,
        rootMargin: '100px',
        triggerOnce: true,
    });

    const [browserSupportIntersectionObserver, setBrowserSupportIntersectionObserver] = useState(
        canUseDOM && typeof window.IntersectionObserver !== 'undefined',
    );

    // Loads the `IntersectionObserver` polyfill asynchronously on browsers that don't support it.
    if (canUseDOM && typeof window.IntersectionObserver === 'undefined') {
        import('intersection-observer').then(() => {
            setBrowserSupportIntersectionObserver(true);
        });
    }

    // --------------------------------------------------------------------------------------------
    // Object Fit: polyfill and CSS styles
    // --------------------------------------------------------------------------------------------

    const objectFitProps = {};

    const shouldObjectFit = !!height;
    const shouldPolyfillObjectFit =
        canUseDOM &&
        document.documentElement &&
        document.documentElement.style &&
        'objectFit' in document.documentElement.style !== true;

    warning(
        (!height && !containerAspectRatio) ||
            (height && !containerAspectRatio) ||
            (!height && containerAspectRatio),
        'You can pass either a `height` or `containerAspectRatio` to the `Image` component, but not both.',
    );

    useEffect(
        () => {
            // We polyfill `object-fit` for browsers that don't support it. We only do it if we're
            // using a `height` or `containerAspectRatio`. The `shouldLoadImage` variable ensures
            // that we don't try to polyfill the image before the `src` exists. This can happy
            // when we lazy-load.
            if (shouldObjectFit && containerRef && shouldLoadImage && shouldPolyfillObjectFit) {
                import('object-fit-images').then(({ default: ObjectFitImages }) => {
                    ObjectFitImages(containerRef.querySelector('img'));
                });
            }
        },
        [shouldObjectFit, containerRef, shouldLoadImage, shouldPolyfillObjectFit],
    );

    if (shouldObjectFit) {
        objectFitProps.style = {
            objectFit,
            objectPosition,
        };
        if (shouldPolyfillObjectFit) {
            // Weird, but this is how the polyfill knows what to do with the image in IE.
            objectFitProps.style.fontFamily = `"object-fit: ${objectFit}; object-position: ${objectPosition}"`;
        }
    }

    // --------------------------------------------------------------------------------------------
    // Image Aspect Ratio used for image placeholder
    // --------------------------------------------------------------------------------------------

    const aspectRatioBoxProps = {};

    if (containerAspectRatio) {
        // This ensures that lazy-loaded images don't cause the browser scroll to jump once the
        // image has loaded. It uses the following technique:
        // https://css-tricks.com/aspect-ratio-boxes/
        const h = 100000;
        const w = h * containerAspectRatio;

        aspectRatioBoxProps.style = {
            paddingTop: `${(h / w) * 100}%`,
            overflow: 'hidden', // Prevents alt text from taking up space before `src` is populated
            height: 0,
        };
    }

    // --------------------------------------------------------------------------------------------
    // Sources and srcSets
    // --------------------------------------------------------------------------------------------

    // We separate `webp` from the `jpeg`/`png` so that we can apply the `imgTagSource` directly
    // onto the `img` tag. While this makes the code messier, it is needed to work around a bug in
    // Safari:
    // - https://bugs.webkit.org/show_bug.cgi?id=190031
    // - https://bugs.webkit.org/show_bug.cgi?id=177068

    const webpSource = find(sources, s => s.type === 'image/webp');
    const imgTagSource = find(sources, s => s.type === 'image/jpeg' || s.type === 'image/png');

    // --------------------------------------------------------------------------------------------
    // Image load and error states
    // --------------------------------------------------------------------------------------------

    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);

    return (
        <>
            <picture
                {...rest}
                className={classNames(styles.picture, className)}
                ref={el => {
                    // Using a callback `ref` on this `picture` allows us to have multiple `ref`s on one
                    // element.
                    setContainerRef(el);

                    // We don't want to turn on the `react-intersection-observer` functionality until
                    // the polyfill is done loading.
                    if (browserSupportIntersectionObserver) {
                        inViewRef(el);
                    }

                    // `outerRef` is the potential forwarded `ref` passed in from a consumer.
                    if (outerRef) {
                        outerRef(el);
                    }
                }}
            >
                {webpSource && (
                    <source
                        type={webpSource.type}
                        // Only add this attribute if lazyload has been triggered.
                        srcSet={shouldLoadImage ? webpSource.srcSet : undefined}
                        sizes={sizes}
                    />
                )}
                <img
                    // The order of `sizes`, `srcSet`, and `src` is important to work around a bug in
                    // Safari. Once the bug is fixed, we should simplify this by using `src` on the
                    // `img` tag and using `source` tags.
                    sizes={sizes}
                    // Only add this attribute if lazyload has been triggered.
                    srcSet={shouldLoadImage && imgTagSource ? imgTagSource.srcSet : undefined}
                    // Only add this attribute if lazyload has been triggered.
                    src={shouldLoadImage ? src : undefined}
                    // Height is generally only used for full-width hero images.
                    height={height}
                    alt={alt}
                    // Adds object fit values if specified and adds/removes placeholder padding.
                    style={{
                        ...(shouldObjectFit ? objectFitProps.style : {}),
                        ...(isLoaded || isError ? {} : aspectRatioBoxProps.style),
                    }}
                    // Once loaded we remove the placeholder and add a class to transition the
                    // opacity from 0 to 1.
                    onLoad={() => {
                        setIsLoaded(true);
                    }}
                    onError={() => {
                        setIsError(true);
                    }}
                    className={classNames({
                        [styles.image]: true,
                        [styles.imageLoading]: true,
                        [styles.imageLoaded]: isLoaded,
                        [styles.imageError]: isError,
                    })}
                />
            </picture>
            <noscript>
                <img src={src} alt={alt} />
            </noscript>
        </>
    );
});

Image.propTypes = {
    /**
     * If `sources` is provided, this image will be loaded by search engines and lazy-loaded for
     * users on browsers that don't support responsive images. If `sources` is not provided, this
     * image will be lazy-loaded.
     */
    src: PropTypes.string.isRequired,
    /**
     * Allows the browser to choose the best file format and image size based on the device screen
     * density and the width of the rendered image.
     */
    sources: PropTypes.arrayOf(
        PropTypes.shape({
            type: PropTypes.oneOf(['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
                .isRequired,
            srcSet: PropTypes.string.isRequired,
        }),
    ),
    alt: PropTypes.string,
    /**
     * Crops the image at the provided height. The `objectFit` and `objectPosition` props can be
     * used to control how the image is cropped.
     */
    height: PropTypes.string,
    /**
     * Creates a [placeholder box](https://css-tricks.com/aspect-ratio-boxes/) for the image.
     * The placeholder prevents the browser scroll from jumping when the image is lazy-loaded.
     */
    containerAspectRatio: PropTypes.number,
    /**
     * Provides control over how the image should be resized to fit the container. This controls the
     * `object-fit` CSS property. It is only useful if `height` is used to "crop" the image.
     */
    objectFit: PropTypes.oneOf(['cover', 'contain']),
    /**
     * Provides control over how the image position in the container. This controls the
     * `object-position` CSS property. It is only useful if `height` is used to "crop" the image.
     */
    objectPosition: PropTypes.oneOf(['top', 'center', 'bottom', 'left', 'right']),
};

Image.defaultProps = {
    sources: [],
    alt: '',
    height: undefined,
    containerAspectRatio: undefined,
    objectFit: 'cover',
    objectPosition: 'center',
};

// Needed because of the `forwardRef`.
Image.displayName = 'Image';

export default Image;
